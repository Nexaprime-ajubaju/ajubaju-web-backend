import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import {
  Call,
  CallDocument,
  CallStatus,
  CallType,
} from './schemas/call.schema';
import {
  Conversation,
  ConversationDocument,
} from '../chats/schemas/conversation.schema';
import { Message, MessageDocument } from '../chats/schemas/message.schema';
import { ListCallsDto } from './dto/list-calls.dto';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);
  private readonly activeCallTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly staleRingingMs = 12 * 1000;
  private readonly staleAcceptedMs = 6 * 60 * 60 * 1000;

  constructor(
    @InjectModel(Call.name) private readonly callModel: Model<CallDocument>,
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
  ) {}

  private getCallSystemText(call: CallDocument) {
    if (call.status === 'missed') return '📞 Missed call';
    if (call.status === 'rejected') return '📞 Call declined';
    if (call.status === 'failed') return '📞 Call failed';
    if (call.status === 'busy') return '📞 User was busy';
    if (call.status === 'ended') {
      if ((call.durationSec || 0) > 0) {
        const mins = String(Math.floor((call.durationSec || 0) / 60)).padStart(
          2,
          '0',
        );
        const secs = String((call.durationSec || 0) % 60).padStart(2, '0');
        return `📞 Call ended (${mins}:${secs})`;
      }
      return '📞 Call ended';
    }
    return '📞 Call update';
  }

  private async persistCallEventMessage(call: CallDocument) {
    const conversation = await this.conversationModel
      .findById(call.conversationId)
      .exec();
    if (!conversation) return;

    const text = this.getCallSystemText(call);
    const adId = conversation.adId || call.conversationId;
    const adTitle = conversation.adTitle || null;

    await this.messageModel.create({
      conversationId: String(conversation._id),
      adId,
      adTitle,
      senderId: String(call.callerId),
      text,
      attachments: [],
      readBy: [String(call.callerId)],
    });

    conversation.lastMessageText = text;
    conversation.lastMessageAt = new Date();
    conversation.lastMessageAdId = adId;
    conversation.lastMessageAdTitle = adTitle;
    conversation.messagesCount = (conversation.messagesCount || 0) + 1;
    await conversation.save();
  }

  private async getConversationForParticipant(
    userId: string,
    conversationId: string,
  ) {
    const conversation = await this.conversationModel
      .findById(conversationId)
      .exec();
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (!conversation.participants.includes(String(userId))) {
      throw new BadRequestException('You are not part of this conversation');
    }

    return conversation;
  }

  async createCallInvite(
    callerId: string,
    conversationId: string,
    calleeId: string,
    type: CallType,
  ) {
    const conversation = await this.getConversationForParticipant(
      callerId,
      conversationId,
    );

    if (!conversation.participants.includes(String(calleeId))) {
      throw new BadRequestException('Callee is not part of this conversation');
    }

    if (String(callerId) === String(calleeId)) {
      throw new BadRequestException('You cannot call yourself');
    }

    await this.cleanupStaleActiveCallsForUser(String(calleeId));
    await this.cleanupStaleActiveCallsForUser(String(callerId));

    let busyCall = await this.callModel
      .findOne({
        participants: String(calleeId),
        status: { $in: ['initiated', 'ringing', 'accepted'] },
      })
      .sort({ createdAt: -1 })
      .exec();

    if (busyCall) {
      const isSamePair =
        String(busyCall.callerId) === String(callerId) &&
        String(busyCall.calleeId) === String(calleeId) &&
        ['initiated', 'ringing'].includes(busyCall.status);

      const callAgeMs =
        Date.now() -
        new Date(busyCall.startedAt || busyCall.createdAt).getTime();
      const isStaleRinging =
        ['initiated', 'ringing'].includes(busyCall.status) &&
        callAgeMs > this.staleRingingMs;

      // Allow immediate redial for same pair by closing previous in-flight invite.
      if (isSamePair || isStaleRinging) {
        await this.endCallInternal(busyCall.callId, 'missed', 'timeout');
        busyCall = null;
      }
    }

    if (busyCall) {
      return {
        busy: true,
        call: null,
      };
    }

    const callId = uuidv4();
    const now = new Date();

    const call = await this.callModel.create({
      callId,
      conversationId,
      callerId: String(callerId),
      calleeId: String(calleeId),
      type,
      status: 'ringing',
      startedAt: now,
      participants: [String(callerId), String(calleeId)],
    });

    this.startMissedCallTimer(call.callId);

    return {
      busy: false,
      call,
    };
  }

  private async cleanupStaleActiveCallsForUser(userId: string) {
    const now = Date.now();

    const activeCalls = await this.callModel
      .find({
        participants: String(userId),
        status: { $in: ['initiated', 'ringing', 'accepted'] },
      })
      .exec();

    for (const call of activeCalls) {
      const ageMs =
        now -
        new Date(call.startedAt || call.updatedAt || call.createdAt).getTime();

      if (
        ['initiated', 'ringing'].includes(call.status) &&
        ageMs > this.staleRingingMs
      ) {
        await this.endCallInternal(call.callId, 'missed', 'timeout');
        continue;
      }

      if (call.status === 'accepted' && ageMs > this.staleAcceptedMs) {
        await this.endCallInternal(call.callId, 'ended', 'network_error');
      }
    }
  }

  private startMissedCallTimer(callId: string) {
    const timeout = setTimeout(async () => {
      try {
        await this.endCallInternal(callId, 'missed', 'timeout');
      } catch (error) {
        this.logger.warn(
          `Missed call timer error for ${callId}: ${error.message}`,
        );
      } finally {
        this.activeCallTimeouts.delete(callId);
      }
    }, 30000);

    this.activeCallTimeouts.set(callId, timeout);
  }

  private clearMissedCallTimer(callId: string) {
    const timeout = this.activeCallTimeouts.get(callId);
    if (timeout) {
      clearTimeout(timeout);
      this.activeCallTimeouts.delete(callId);
    }
  }

  async getCallByCallId(callId: string) {
    const call = await this.callModel.findOne({ callId }).exec();
    if (!call) {
      throw new NotFoundException('Call not found');
    }
    return call;
  }

  async ensureParticipant(callId: string, userId: string) {
    const call = await this.getCallByCallId(callId);
    if (!call.participants.includes(String(userId))) {
      throw new BadRequestException('You are not a participant of this call');
    }
    return call;
  }

  async acceptCall(callId: string, userId: string) {
    const call = await this.ensureParticipant(callId, userId);

    if (String(call.calleeId) !== String(userId)) {
      throw new BadRequestException('Only callee can accept call');
    }

    if (!['ringing', 'initiated'].includes(call.status)) {
      throw new BadRequestException(
        `Cannot accept call in status ${call.status}`,
      );
    }

    call.status = 'accepted';
    call.answeredAt = new Date();
    await call.save();
    this.clearMissedCallTimer(call.callId);
    await this.persistCallEventMessage(call);
    return call;
  }

  async rejectCall(callId: string, userId: string) {
    const call = await this.ensureParticipant(callId, userId);

    if (String(call.calleeId) !== String(userId)) {
      throw new BadRequestException('Only callee can reject call');
    }

    if (!['ringing', 'initiated'].includes(call.status)) {
      throw new BadRequestException(
        `Cannot reject call in status ${call.status}`,
      );
    }

    return this.endCallInternal(call.callId, 'rejected', 'declined');
  }

  async markMissedIfUnanswered(callId: string) {
    const call = await this.getCallByCallId(callId);
    if (!['ringing', 'initiated'].includes(call.status)) {
      return call;
    }

    return this.endCallInternal(call.callId, 'missed', 'timeout');
  }

  private async endCallInternal(
    callId: string,
    status: CallStatus,
    reason?: string,
  ) {
    const call = await this.getCallByCallId(callId);

    if (
      ['ended', 'rejected', 'missed', 'failed', 'busy'].includes(call.status)
    ) {
      return call;
    }

    const endedAt = new Date();
    call.status = status;
    call.endedAt = endedAt;
    call.endReason = reason;

    if (call.answeredAt) {
      const durationMs =
        endedAt.getTime() - new Date(call.answeredAt).getTime();
      call.durationSec = Math.max(0, Math.floor(durationMs / 1000));
    } else {
      call.durationSec = 0;
    }

    await call.save();
    this.clearMissedCallTimer(call.callId);
    return call;
  }

  async endCall(callId: string, userId: string, reason = 'hangup') {
    await this.ensureParticipant(callId, userId);
    return this.endCallInternal(callId, 'ended', reason);
  }

  async listCallsForUser(userId: string, query: ListCallsDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.callModel
        .find({ participants: String(userId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.callModel.countDocuments({ participants: String(userId) }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

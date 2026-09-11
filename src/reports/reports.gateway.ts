import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Logger, UseGuards, Inject, Optional } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

@WebSocketGateway({
  namespace: '/reports',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class ReportsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ReportsGateway.name);
  private adminSockets = new Set<string>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Optional() private eventEmitter?: EventEmitter2,
  ) {
    // Listen for report events from the entire application
    if (this.eventEmitter) {
      this.eventEmitter.on('report.submitted', (data) =>
        this.handleReportSubmitted(data),
      );
    }
  }

  handleConnection(client: Socket) {
    try {
      const tokenFromAuth = client.handshake.auth?.token;
      const tokenFromHeader = client.handshake.headers.authorization?.replace(
        'Bearer ',
        '',
      );
      const token = tokenFromAuth || tokenFromHeader;

      if (!token) {
        this.logger.error('❌ WebSocket: No token provided');
        throw new WsException('Authentication token is required');
      }

      // Verify JWT token
      let decoded;
      try {
        decoded = this.jwtService.verify(token, {
          secret: this.configService.get('JWT_SECRET'),
        });
      } catch (jwtError: any) {
        this.logger.error(`❌ JWT verification failed: ${jwtError.message}`);
        throw new WsException(`JWT verification failed: ${jwtError.message}`);
      }

      // Only admins can connect to reports namespace
      if (decoded.role !== 'admin') {
        this.logger.error(
          `❌ Non-admin user tried to connect: ${decoded.sub} (role: ${decoded.role})`,
        );
        throw new WsException('Only admins can access reports');
      }

      client.data.userId = decoded.sub;
      client.data.userRole = decoded.role;

      // Track admin clients
      this.adminSockets.add(client.id);

      this.logger.log(
        `✅ Admin ${decoded.sub} connected to reports (Total admins: ${this.adminSockets.size})`,
      );

      // Send confirmation
      client.emit('connected', {
        message: 'Connected to report notifications',
        connectedAt: new Date().toISOString(),
        userId: decoded.sub,
        role: decoded.role,
      });
    } catch (error: any) {
      this.logger.error(
        `❌ Socket connection failed: ${error.message}`,
        error.stack,
      );
      client.emit('error', {
        message: error.message || 'Authentication failed',
        status: 'error',
      });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.adminSockets.delete(client.id);
    this.logger.log(
      `❌ Admin disconnected from reports (Total admins: ${this.adminSockets.size})`,
    );
  }

  /**
   * Handle new report submitted event
   */
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    return { pong: true, timestamp: new Date().toISOString() };
  }

  /**
   * Called by service/Kafka when a new report is submitted
   */
  public broadcastNewReport(reportData: any) {
    if (this.server && this.adminSockets.size > 0) {
      this.logger.log(
        `📢 Broadcasting new report to ${this.adminSockets.size} admins`,
      );
      this.server.emit('new_report', {
        reportId: reportData.reportId,
        adId: reportData.adId,
        reason: reportData.reason,
        reportCount: reportData.reportCount,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Internal handler for report submitted events
   */
  private handleReportSubmitted(data: any) {
    this.broadcastNewReport(data);
  }

  /**
   * Get connected admins count (for monitoring)
   */
  @SubscribeMessage('get_status')
  handleGetStatus(@ConnectedSocket() client: Socket) {
    return this.getGatewayStatus();
  }

  public getGatewayStatus() {
    return {
      status: 'ok',
      adminsConnected: this.adminSockets.size,
      timestamp: new Date().toISOString(),
    };
  }
}

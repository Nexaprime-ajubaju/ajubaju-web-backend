export class UserResponseDto {
  id: string;
  name: string;
  email: string;
  role: string;
  accountType: 'user' | 'merchant';
  isBanned?: boolean;
  banReason?: string;
  banUntil?: string | Date | null;
  isEmailVerified: boolean;
  profile?: any;
  city?: string | null;
  phone?: string | null;
  joinedDate?: Date | string;
  profilePhoto?: string | null;
  kycStatus?: string;
  kycRejectionReason?: string;
  preferredCategories?: string[];
  merchantProfile?: any;
  iWantPreference?: {
    category?: string;
    title?: string;
    description?: string;
    createdAt?: Date;
    updatedAt?: Date;
  } | null;
  createdAt: Date;

  // Loyalty fields
  loyaltyPoints?: number;
  merchantLoyaltyPoints?: { [merchantId: string]: number };
  loyaltyTier?: string;

  // Moderation / restriction fields
  contentUploadRestrictionUntil?: Date | string | null;
  security?: {
    contentUploadRestrictionUntil?: Date | string | null;
  };

  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}

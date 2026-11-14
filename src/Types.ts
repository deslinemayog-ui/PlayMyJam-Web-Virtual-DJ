export type UserRole = 'patron' | 'dj' | 'admin';
export type LocationType = {
  latitude:number;
  longitude:number;
  text?:string;
  short_name?:string;
  long_name?:string
}
export interface PlayMyJamProfile {
  role?: UserRole;
  userId?: string;
  appAdmin?: boolean;
  notificationToken?: string;
  clubId?: string;
  fname_lower?:string;
  subscriptionType?: 'credit' | 'premium';
  freePlays?: number;
  premiumActive?: boolean;
  premiumExpiry?: number;
  clubName?: string;
  operatingHours?: string;
  code?: number | string;
  acceptTerms?: boolean;
  password?: string;
  referredBy?: string;
  photos?: {
    photoId: number;
    url: string;
  }[];
  about?: string;
  rates?: string[];
  balance?: number;
  deleted?: boolean;
  address?: LocationType;
  geoHash?: string;
  fname?: string;
  phoneNumber?: string;
  avatar?: string;
  isVerified?: boolean;
  date?: number;
  image?: string;
  email?: string;
  djInfo?: DJ
  privacy?:PrivacyType[]
}
export type PrivacyType = {
  type:string;
  selected:boolean;
  amount?:number;
  value?:string;
  subscriptions?:string[];
}
export interface DJ extends Omit<PlayMyJamProfile, 'genres'> {
    name: string;
    djName: string;
    bio: string;
    avatar: string;
    listeners: number;
    genres: string[];
    contactInfo: {
        phone: string;
        email: string;
    };
    socialLinks: {
        instagram: string;
        soundcloud: string;
        spotify: string;
    };
    clubName?: string;
    clubId?:string;
    time?: string;
    endTime?: string;
    active?:boolean;
    venues?: Array<{
        clubId: string;
        clubName: string;
        startTime: string;
        endTime: string;
        isConfirmed: boolean;
        confirmedByClub: boolean;
        addedAt: string;
    }>;
    availability: {
        days: string[];
        hours: {
            start: string;
            end: string;
        };
    };
};

export interface BaseSong {
  id: string;
  title: string;
  artist: string;
  albumArt: string;
  url: string;
  currentBid?: number;
  currentBiders?: {userId:string,amount:number}[];
  active?: boolean;
  isLocal?: boolean;
  audioUrl?: string;
  ownerId?: string;
  ownerName?: string;
  playCount?: number;
  uploadProgress?: number;
  DJCurrentSong?: boolean;
  action: 'play' | 'pause' | 'stop';
  isPlaying:boolean;
  uploadStatus?: 'idle' | 'uploading' | 'completed' | 'failed';
  currentPosition?: number;
  ownershipLink?:string;
  originalTrackId?:string;
  fingerprint?:string;
  isOwnershipApproved?:boolean;
  isSuggested:boolean;
  totalBidAmount?: number;
  claimedAmount?: number;
}

export interface Song extends BaseSong {
  duration: number;
  freePlays?:number;
  premiumPlays?:number;
  creditPlays?:number;
  creditPlaysClaimed?:number;
  premiumPlaysClaimed?:number;
  premiumPlaysLastClaimedDate?:number;
}

export interface Track extends BaseSong {
  duration?: number;
  genres?: string[];
}

// ---- PlayMyJam Brands Portal Types ----

export type BrandStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type ProductStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'archived';
export type ItemCondition = 'new' | 'like_new' | 'good' | 'fair';
export type SizeFit = 'slim' | 'regular' | 'oversized' | 'relaxed';
export type GenderCategory = 'men' | 'women' | 'unisex' | 'kids';

export interface Brand {
  id: string;
  userId: string;
  brandName: string;
  brandDescription: string;
  logoUrl?: string;
  brandWebsite?: string;
  contactEmail: string;
  contactPhone?: string;
  businessAddress?: string;
  businessRegNumber?: string;
  status: BrandStatus;
  reviewedBy?: string;
  reviewedAt?: number;
  rejectionReason?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BrandProduct {
  id: string;
  brandId: string;
  title: string;
  description: string;
  category: string;
  gender: GenderCategory;
  basePrice: number;
  currency: string;
  sizes: string[];
  colors: ProductColor[];
  images: ProductImage[];
  status: ProductStatus;
  createdAt: number;
  updatedAt: number;
  reviewedBy?: string;
  reviewedAt?: number;
  rejectionReason?: string;
  totalSold?: number;
  totalRevenue?: number;
}

export interface ProductColor {
  id: string;
  name: string;
  hexCode: string;
  stock: number;
  sku?: string;
}

export interface ProductImage {
  id: string;
  url: string;
  isPrimary: boolean;
  order: number;
}

export interface BrandItem {
  id: string;
  productId: string;
  brandId: string;
  uniqueCode: string;
  qrUrl: string;
  status: 'registered' | 'verified' | 'unverified' | 'suspicious' | 'claimed' | 'transferred';
  condition: ItemCondition;
  sizeFit: SizeFit;
  size: string;
  color: string;
  serialNumber: string;
  claimedBy?: string;
  claimedAt?: number;
  transferredFrom?: string;
  transferredAt?: number;
  createdAt: number;
  updatedAt: number;
  scanCount?: number;
  lastScannedAt?: number;
  flaggedReason?: string;
}

export interface BrandOrder {
  id: string;
  brandId: string;
  itemId?: string;
  productId: string;
  buyerId: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  currency: string;
  status: 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'completed' | 'refunded' | 'cancelled';
  shippingAddress?: any;
  trackingNumber?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BrandPayout {
  id: string;
  brandId: string;
  amount: number;
  currency: string;
  periodStart: number;
  periodEnd: number;
  status: 'pending' | 'processing' | 'paid' | 'failed';
  createdAt: number;
}

export interface BrandRegistration {
  id: string;
  userId: string;
  brandName: string;
  brandDescription: string;
  contactEmail: string;
  contactPhone?: string;
  businessAddress?: string;
  businessRegNumber?: string;
  status: BrandStatus;
  createdAt: number;
}

export interface BrandPortalSession {
  userId: string;
  brandId: string;
  brandName: string;
  role: 'brand_owner' | 'brand_admin' | 'brand_manager';
  authenticatedAt: number;
}
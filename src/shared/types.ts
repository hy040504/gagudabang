// 프론트·백엔드 공용 계약. 브랜드 기본값은 '가구다방'.
export const BRAND_NAME = '가구다방';

export const ITEM_STATUSES = ['PENDING', 'IN_PROGRESS', 'SCHEDULED', 'COMPLETED', 'CANCELED'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export const CATEGORIES = ['BED', 'SOFA', 'DINING', 'CLOSET', 'DESK', 'ETC'] as const;
export type Category = (typeof CATEGORIES)[number];
export const CONDITIONS = ['BEST', 'GOOD', 'FAIR', 'POOR_DISPOSE'] as const;
export type Condition = (typeof CONDITIONS)[number];
export const PREFERENCES = ['RESALE', 'DISPOSE', 'CONSULT'] as const;
export type Preference = (typeof PREFERENCES)[number];
export const HANDLING_TYPES = ['UNDECIDED', 'RESALE', 'DISPOSE'] as const;
export type HandlingType = (typeof HANDLING_TYPES)[number];
export const ELEVATORS = ['YES', 'NO_STAIRS', 'FIRST_FLOOR'] as const;
export type Elevator = (typeof ELEVATORS)[number];

export const TRANSITIONS: Record<ItemStatus, readonly ItemStatus[]> = {
  PENDING: ['IN_PROGRESS', 'SCHEDULED', 'CANCELED'],
  IN_PROGRESS: ['SCHEDULED', 'COMPLETED', 'CANCELED'],
  SCHEDULED: ['IN_PROGRESS', 'COMPLETED', 'CANCELED'],
  COMPLETED: [],
  CANCELED: [],
};

export const DEFAULT_PUBLIC_NOTICE: Record<ItemStatus, string> = {
  PENDING: '신청이 정상 접수되었습니다. 담당자가 가구 사진과 일정을 확인하고 있습니다.',
  IN_PROGRESS: '진행 중입니다. 확정 즉시 안내드립니다.',
  SCHEDULED: '방문 반출 일정이 확정되었습니다.',
  COMPLETED: '반출 및 모든 처리가 완료되었습니다. 이용해 주셔서 감사합니다.',
  CANCELED: '신청이 취소되었거나 진행이 어려운 품목입니다. 상세 안내를 확인해 주세요.',
};

export interface ApiOk<T> { ok: true; data: T }
export interface ApiErr { ok: false; error: { code: string; message: string; fieldErrors?: Record<string, string> } }

export interface PublicConfig { companyName: string; ceoName: string; bizNo: string; phone: string; hours: string; address: string }

export interface PublicPhotoDto { storedName: string; url: string; photoTag: 'FULL' | 'DETAIL'; mimeType: string }
export interface PublicItemDto {
  id: number; category: Category; itemName: string; conditionGrade: Condition; customerPreference: Preference;
  itemNote: string; handlingType: HandlingType; status: ItemStatus; saleDeadline: string; pickupSchedule: string;
  publicNotice: string; photos: PublicPhotoDto[];
}
export interface PublicApplicationDto {
  requestCode: string; applicantName: string; phone: string; zipcode: string; address: string; addressDetail: string;
  elevatorInfo: Elevator; movingDate: string; preferredPickupDate: string; customerMemo: string; createdAt: string;
  items: PublicItemDto[];
}
export interface AdminItemDto extends PublicItemDto { adminItemMemo: string; version: number; updatedAt: string }
export interface AdminApplicationDetailDto extends Omit<PublicApplicationDto, 'items'> {
  id: number; adminMemo: string; isDemo: boolean; version: number; userId: number | null; items: AdminItemDto[];
}
export interface StatusHistoryDto {
  id: number; applicationId: number; itemId: number | null; actorRole: string; actorName: string;
  actionType: string; before: unknown; after: unknown; note: string; createdAt: string;
}
export interface CustomerProfileDto { id: number; username: string; name: string; phone: string; defaultZipcode: string; defaultAddress: string; defaultAddressDetail: string }

export interface AdminApplicationSummaryDto {
  id: number; requestCode: string; applicantName: string; phone: string; movingDate: string; preferredPickupDate: string;
  createdAt: string; isDemo: boolean; movingDday: number | null; // 미종결 품목이 있을 때만 값
  items: { id: number; itemName: string; status: ItemStatus; handlingType: HandlingType; saleDeadline: string; deadlineDday: number | null }[];
}
export interface AdminKpis { pendingItems: number; movingSoonApplications: number; deadlineAlertItems: number; pickupIn7DaysItems: number }
export interface ScheduleCalendarEventDto {
  date: string; kind: 'MOVING' | 'DEADLINE' | 'PICKUP' | 'CUSTOM'; applicationId: number; requestCode: string; itemId: number | null; label: string;
  /** 운영자가 직접 추가한 일정(CUSTOM)일 때만 있다. 삭제할 때 쓴다. */
  eventId?: number;
}
/** 관리자 통계: 지금까지 쌓인 접수와 품목을 종류별로 센 값 */
/** 통계 기간: 7일·30일은 날짜별, 12개월은 달별, 전체는 해별로 묶는다 */
export const STATS_PERIODS = ['7d', '30d', '12m', 'all'] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];
export interface StatsCounts { applications: number; items: number; visitors: number; pageviews: number }
export interface AdminStatsDto {
  period: StatsPeriod; unit: 'day' | 'month' | 'year';
  /** 기간과 상관없는 누적 값 */
  totals: { applications: number; items: number; members: number; smsSent: number };
  /** 고른 기간과 바로 앞 같은 길이의 기간 (전체 기간에는 앞 기간이 없다) */
  current: StatsCounts; previous: StatsCounts | null;
  today: { visitors: number; pageviews: number };
  /** 고른 기간에 접수된 품목의 분포 */
  byStatus: Record<string, number>; byHandling: Record<string, number>; byCategory: Record<string, number>;
  /** 빈 칸 없이 기간의 모든 날(달, 해)을 담는다. key는 YYYY-MM-DD, YYYY-MM, YYYY */
  series: ({ key: string } & StatsCounts)[];
}

export interface ApplicationPayload {
  applicantName: string; phone: string; pin: string; zipcode?: string; address: string; addressDetail?: string;
  elevatorInfo: Elevator; movingDate: string; preferredPickupDate: string; customerMemo?: string;
  privacyConsented: boolean; marketingConsented?: boolean;
  items: { category: Category; itemName: string; conditionGrade: Condition; customerPreference: Preference; itemNote?: string; photoTags?: ('FULL' | 'DETAIL')[] }[];
}
export interface AdminItemPatchDto {
  handlingType: HandlingType; status: ItemStatus; saleDeadline: string; pickupSchedule: string;
  publicNotice: string; adminItemMemo: string; version: number; note?: string;
}

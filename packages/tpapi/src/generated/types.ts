// GENERATED FROM ITPAPIPOS.wsdl — DO NOT EDIT BY HAND.
// Regenerate: pnpm --filter @kiosk/tpapi-discovery generate


export interface TTPApiPosRequest {
  Password: string;
  UserName: string;
  AppToken: string;
  AppName?: string;
}

export interface TPosRestartRequest extends TTPApiPosRequest {
}

export type TExtraInfoArray = TExtraInfo[];

export interface TExtraInfo {
  Key: string;
  Value: string;
  Extra: TExtraInfoArray;
}

export type TOrderItemArray = TOrderItem[];

export interface TOrderItem {
  ItemNumber: number;
  ArticleId: number;
  OrderItemType: number;
  Text: string;
  ManualPrice: number;
  Quantity: number;
  Extra: TExtraInfoArray;
}

export type TClientsArray = TClient[];

export interface TClient {
  Id: number;
  Number: number;
  Name: string;
  Country?: string;
  Phone?: string;
  Fax?: string;
  Email?: string;
  Website?: string;
  Address?: string;
  Info?: string;
  BirthDate?: string;
  CardNumber?: string;
  Code?: string;
  OnInvoice?: boolean;
  PriceActive?: boolean;
  Price?: number;
  PromotionPrice?: number;
  AccountBalance: number;
  AccountLimit?: number;
  IsSharedAccount?: boolean;
  SharedAccount?: string;
  SavePoints: number;
  SaveAmount?: number;
  Extra: TExtraInfoArray;
}

export type TUserInfoArray = TUserInfo[];

export interface TUserInfo {
  UserId: number;
  UserName?: string;
  FirstName?: string;
  LastName?: string;
  Group?: TUserGroup;
  Credentials?: TCredentialArray;
  Language?: TLanguage;
  Void?: boolean;
  ClockIn?: boolean;
  TagReaderCode?: string;
  OperatorId?: string;
  Address?: string;
  Country?: string;
  Phone?: string;
  Birthdate?: string;
  Insurance?: string;
  HourlyWage?: number;
  HourlyWages?: THourlyWageItemArray;
  Void_number?: number;
  Extra: TExtraInfoArray;
}

export interface TUserGroup {
  GroupId: number;
  GroupName: string;
}

export type TCredentialArray = TCredential[];

export interface TLanguage {
  LangCode: string;
  Language: string;
}

export type THourlyWageItemArray = THourlyWageItem[];

export interface TCredential {
  CredentialGuid: string;
  CredentialName: string;
}

export interface THourlyWageItem {
  Position: string;
  HourlyWage: number;
  HourlyWageOvertime: number;
}

export type TCountriesArray = TCountry[];

export interface TCountry {
  CountryId: number;
  CountryName: string;
  Kind: number;
  Extra: TExtraInfoArray;
}

export type TKeyValueArray = TKeyValue[];

export interface TKeyValue {
  Key: string;
  Value: string;
}

export type TPouringsArray = TPouring[];

export interface TPouring {
  TableNumber: number;
  PLU: number;
  DateTime: string;
  Quantity: number;
  WaiterID: number;
  ExternalID: number;
  ExternalUID: string;
  ClientCard: string;
  LCU: number;
  Extra: TExtraInfoArray;
}

export type TClientCardInfoArray = TClientCardInfo[];

export interface TClientCardInfo {
  Id: number;
  Number: number;
  ClientId: number;
  CardNameId: number;
  Card: string;
  IsActive: boolean;
  Extra: TExtraInfoArray;
}

export type TInt64Array = number[];

export interface TTPApiPosResponse {
  ReturnCode: number;
  ReturnMessage: string;
}

export type TTimeAttendanceRecordArray = TTimeAttendanceRecord[];

export interface TTimeAttendanceRecord {
  UserId: number;
  Start: string;
  Stop: string;
  TotalTime: string;
  TotalDecimal: number;
  TotalCosts: number;
  Extra: TExtraInfoArray;
}

export type TTurnoverTransactionArray = TTurnoverTransaction[];

export interface TTurnoverTransaction {
  Id: number;
  OpenDateTime: string;
  CloseDateTime: string;
  TranNumber: string;
  TableNumber: number;
  TablePart: string;
  Covers: number;
  UserId: number;
  DiscountOnTotal: number;
  ServiceCharge: number;
  ClientName: string;
  Orders: TTransactionOrderArray;
  Bills: TTransactionBillArray;
  Proformas: TTransactionProformaArray;
  BillReprints: TTransactionBillReprintArray;
  Extra: TExtraInfoArray;
  ClientId: number;
}

export type TTransactionOrderArray = TTransactionOrder[];

export type TTransactionBillArray = TTransactionBill[];

export type TTransactionProformaArray = TTransactionProforma[];

export type TTransactionBillReprintArray = TTransactionBillReprint[];

export interface TTransactionOrder {
  Id: number;
  DateTime: string;
  ComputerName: string;
  OrderNumber: string;
  UserId: number;
  SalesAreaId: number;
  Items: TTransactionOrderItemArray;
  Extra: TExtraInfoArray;
}

export type TTransactionOrderItemArray = TTransactionOrderItem[];

export interface TTransactionOrderItem {
  Id: number;
  ArticleId: number;
  ItemNumber: number;
  Kind: number;
  Quantity: number;
  SinglePrice: number;
  Price: number;
  Discount: number;
  Vat: number;
  VatPercent: number;
  Text: string;
  HqId: string;
  Extra: TExtraInfoArray;
}

export interface TTableItem extends TTransactionOrderItem {
  Signature: string;
}

export interface TTransactionBill {
  Id: number;
  DateTime: string;
  RealDateTime: string;
  ComputerName: string;
  BillNumber: string;
  UserId: number;
  ClientName: string;
  SalesAreaId: number;
  Tip: number;
  Payments: TTransactionBillPaymentArray;
  Extra: TExtraInfoArray;
  ClientId: number;
}

export type TTransactionBillPaymentArray = TTransactionBillPayment[];

export interface TTransactionBillPayment {
  Id: number;
  PaymentId: number;
  Amount: number;
  Extra: TExtraInfoArray;
}

export interface TTransactionProforma {
  Id: number;
  DateTime: string;
  UserId: number;
  Extra: TExtraInfoArray;
}

export interface TTransactionBillReprint {
  Id: number;
  DateTime: string;
  Extra: TExtraInfoArray;
}

export type TArticleShortArray = TArticleShort[];

export interface TArticleShort {
  ArticleId: number;
  ArticleName: string;
  ArticleNumber: number;
  SalesAreaId: number;
  DepartmentId: number;
  HqId: string;
  Extra: TExtraInfoArray;
}

export type TArticleInfoArray = TArticleInfo[];

export interface TArticleInfo {
  ArticleId: number;
  ArticleName: string;
  ArticleNumber: number;
  Available: TInt64Array;
  DepartmentId: number;
  Prices: TItemPriceArray;
  FreeOption: number;
  Options: TInt64Array;
  IsMenu: boolean;
  IsManualPrice: boolean;
  IsActive: boolean;
  Promo: boolean;
  HqId: string;
  Extra: TExtraInfoArray;
}

export type TItemPriceArray = TItemPrice[];

export interface TItemPrice {
  ArticleId: number;
  PriceId: number;
  Amount: number;
  Vat: number;
  Extra: TExtraInfoArray;
}

export type TOptionInfoArray = TOptionInfo[];

export interface TOptionInfo {
  OptionId: number;
  OptionName: string;
  Available: TInt64Array;
  Items: TItemPriceArray;
  Extra: TExtraInfoArray;
}

export type TPriceInfoArray = TPriceInfo[];

export interface TPriceInfo {
  PriceId: number;
  PriceName: string;
  HqId: string;
  Extra: TExtraInfoArray;
}

export type TPeriodInfoArray = TPeriodInfo[];

export interface TPeriodInfo {
  Id: number;
  Name: string;
  Values: TPeriodValuesArray;
  Extra: TExtraInfoArray;
}

export type TPeriodValuesArray = TPeriodValue[];

export interface TPeriodValue {
  Id: number;
  Name: string;
  FromDay: number;
  ToDay: number;
  IsActive: boolean;
  FromTime: string;
  ToTime: string;
  ValueType: number;
  FromOneDay: string;
  ToOneDay: string;
  Extra: TExtraInfoArray;
}

export type TDepartmentInfoArray = TDepartmentInfo[];

export interface TDepartmentInfo {
  DepartmentId: number;
  DepartmentNumber: number;
  DepartmentName: string;
  Available: TInt64Array;
  Supplement: number;
  Condiment: number;
  GroupId: number;
  SpecialArticles: TInt64Array;
  HqId: string;
  Extra: TExtraInfoArray;
}

export type TGroupInfoArray = TGroupInfo[];

export interface TGroupInfo {
  GroupId: number;
  GroupName: string;
  CategoryId: number;
  HqId: string;
  Extra: TExtraInfoArray;
}

export type TCategoryInfoArray = TCategoryInfo[];

export interface TCategoryInfo {
  CategoryId: number;
  CategoryName: string;
  HqId: string;
  Extra: TExtraInfoArray;
}

export type TPaymentInfoArray = TPaymentInfo[];

export interface TPaymentInfo {
  PaymentId: number;
  PaymentNumber: number;
  PaymentName: string;
  PaymentKind: number;
  Extra: TExtraInfoArray;
}

export type TSalesAreaInfoArray = TSalesAreaInfo[];

export interface TSalesAreaInfo {
  SalesAreaId: number;
  SalesAreaNumber: number;
  SalesAreaName: string;
  PriceId: number;
  Tables: TTableRangeArray;
  Extra: TExtraInfoArray;
}

export type TTableRangeArray = TTableRange[];

export interface TTableRange {
  FromTable: number;
  ToTable: number;
  Extra: TExtraInfoArray;
}

export type TOrderInfoArray = TOrderInfo[];

export interface TOrderInfo {
  TableNumber: number;
  TablePart: string;
  OrderName: string;
  CientName: string;
  OrderDescr: string;
  SalesAreaId: number;
  Extra: TExtraInfoArray;
}

export type TTurnoverBillArray = TTurnoverBill[];

export interface TTurnoverBill {
  OpenDateTime: string;
  CloseDateTime: string;
  ComputerName: string;
  BillNumber: number;
  BillSuffix: string;
  TableNumber: number;
  TablePart: string;
  Covers: number;
  UserId: number;
  SalesAreaId: number;
  Items: TTurnoverBillItemArray;
  Extra: TExtraInfoArray;
}

export type TTurnoverBillItemArray = TTurnoverBillItem[];

export interface TTurnoverBillItem {
  ArticleId: number;
  DateTime: string;
  ItemNumber: number;
  ComputerName: string;
  Quantity: number;
  Price: number;
  Vat: number;
  UserId: number;
  HqId: string;
  Extra: TExtraInfoArray;
}

export type TCancelledItemsArray = TCancelledItem[];

export interface TCancelledItem {
  ArticleId: number;
  DateTime: string;
  UserId: number;
  TableNo: number;
  TablePart: string;
  Quantity: number;
  Price: number;
  PriceId: number;
  Extra: TExtraInfoArray;
}

export type TDepositItemArray = TDepositItem[];

export interface TDepositItem {
  Id: number;
  SalesAreaId: number;
  ClientId: number;
  Amount: number;
  Comments: string;
  PaymentId: number;
  ComputerName: string;
  UserId: number;
  DateTime: string;
  DepositNumber: string;
  Extra: TExtraInfoArray;
}

export type TInOutCashItemArray = TInOutCashItem[];

export interface TInOutCashItem {
  Id: number;
  DateTime: string;
  ComputerName: string;
  UserId: number;
  Amount: number;
  Reason: string;
  Supplier: string;
  Extra: TExtraInfoArray;
}

export type TDiscountGroupInfoArray = TDiscountGroupInfo[];

export interface TDiscountGroupInfo {
  Id: number;
  Name: string;
  Barcode: string;
  DiscountValue: number;
  CheapestArticleDiscountedOnly: boolean;
  Articles: TArticleDiscountItemInfoArray;
  Extra: TExtraInfoArray;
}

export type TArticleDiscountItemInfoArray = TArticleDiscountItemInfo[];

export interface TArticleDiscountItemInfo {
  ArticleId: number;
  DiscountPercent: number;
  Extra: TExtraInfoArray;
}

export type TCoursesArray = TCourse[];

export interface TCourse {
  Id: number;
  Name: string;
  Number: number;
  Separate: boolean;
  Changeable: boolean;
  AutoFire: boolean;
  Extra: TExtraInfoArray;
}

export type TReasonsArray = TReason[];

export interface TReason {
  Id: number;
  Name: string;
  Number: number;
  Extra: TExtraInfoArray;
}

export type TSupplierInfoArray = TSupplierInfo[];

export interface TSupplierInfo {
  Id: number;
  Name: string;
  Number: number;
  Address: string;
  AccountNumber: string;
  Extra: TExtraInfoArray;
}

export type TVoucherInfoArray = TVoucherInfo[];

export interface TVoucherInfo {
  Id: number;
  Barcode: string;
  Status: number;
  OriginalValue: number;
  RemainingValue: number;
  CreationDate: string;
  ExpirationDate: string;
  Extra: TExtraInfoArray;
}

export type TSmartCardGroupInfoArray = TSmartCardGroupInfo[];

export interface TSmartCardGroupInfo {
  Id: number;
  Name: string;
  Description: string;
  Kind: number;
  PriceId: number;
  Extra: TExtraInfoArray;
}

export type TSmartCardInfoArray = TSmartCardInfo[];

export interface TSmartCardInfo {
  Id: number;
  SmartcardGroupId: number;
  Uid: string;
  ClientId: number;
  Extra: TExtraInfoArray;
}

export type TSmartcardDepositReportItemArray = TSmartcardDepositReportItem[];

export interface TSmartcardDepositReportItem {
  Id: number;
  DateTime: string;
  SmartcardId: number;
  UserId: number;
  PaymentId: number;
  Number: string;
  PCName: string;
  Amount: number;
  Initial: boolean;
  Extra: TExtraInfoArray;
}

export type TPrinterInfoArray = TPrinterInfo[];

export interface TPrinterInfo {
  Id: number;
  Name: string;
  Guid: string;
  NullPrinter: boolean;
  Extra: TExtraInfoArray;
}

export type TSizeModifierInfoArray = TSizeModifierInfo[];

export interface TSizeModifierInfo {
  Id: number;
  Number: number;
  Name: string;
  IsActive: boolean;
  Items: TSizeModifierItemInfoArray;
  Extra: TExtraInfoArray;
}

export type TSizeModifierItemInfoArray = TSizeModifierItemInfo[];

export interface TSizeModifierItemInfo {
  Id: number;
  Number: number;
  Name: string;
  IsActive: boolean;
  Extra: TExtraInfoArray;
}

export type TAllergensInfoArray = TAllergenInfo[];

export interface TAllergenInfo {
  Id: number;
  Number: number;
  Name: string;
  Description: string;
  IsActive: boolean;
  Extra: TExtraInfoArray;
}

export type TTableItemArray = TTableItem[];

export type TVoucherPaymentItemArray = TVoucherPaymentItem[];

export interface TVoucherPaymentItem {
  Id: number;
  DateTime: string;
  ComputerName: string;
  UserId: number;
  Barcode: string;
  PaymentId: number;
  Amount: number;
  Extra: TExtraInfoArray;
}

export type TClientCardNameInfoArray = TClientCardNameInfo[];

export interface TClientCardNameInfo {
  Id: number;
  Name: string;
  IsActive: boolean;
  Extra: TExtraInfoArray;
}

export type THotelGuestInfoArray = THotelGuestInfo[];

export interface THotelGuestInfo {
  Room: string;
  Sequence: number;
  Name: string;
  ReservationId: string;
  Extra: TExtraInfoArray;
  ExtraDisplayInfo: TKeyValueArray;
}

export type TCardDepositItemArray = TCardDepositItem[];

export interface TCardDepositItem {
  Id: number;
  DateTime: string;
  UserId: number;
  Amount: number;
  ComputerName: string;
  PaymentId: number;
  DepositNumber: string;
  Extra: TExtraInfoArray;
}

export interface TGetArticlesRequest extends TTPApiPosRequest {
  SalesAreaId?: number;
}

export interface TGetArticlesInfoRequest extends TTPApiPosRequest {
  ArticleId?: number;
  SalesAreaId?: number;
  GetInactive?: boolean;
  Extra?: TExtraInfoArray;
}

export interface TGetOptionsInfoRequest extends TTPApiPosRequest {
  OptionId?: number;
  SalesAreaId?: number;
}

export interface TGetPricesInfoRequest extends TTPApiPosRequest {
}

export interface TGetPeriodsInfoRequest extends TTPApiPosRequest {
}

export interface TGetDepartmentsInfoRequest extends TTPApiPosRequest {
  SalesAreaId?: number;
  DepartmentId?: number;
}

export interface TGetGroupsInfoRequest extends TTPApiPosRequest {
}

export interface TGetCategoriesInfoRequest extends TTPApiPosRequest {
}

export interface TGetPaymentsInfoRequest extends TTPApiPosRequest {
}

export interface TGetSalesAreasInfoRequest extends TTPApiPosRequest {
}

export interface TGetActiveOrdersRequest extends TTPApiPosRequest {
  SalesAreaId?: number;
}

export interface TCreateOrderRequest extends TTPApiPosRequest {
  TableNumber: number;
  TablePart: string;
  ClientName?: string;
  OrderName?: string;
  OrderDescr?: string;
  Items: TOrderItemArray;
  Covers?: number;
  Extra?: TExtraInfoArray;
  ClientId?: number;
}

export interface TCloseOrderRequest extends TTPApiPosRequest {
  TableNumber: number;
  TablePart: string;
  PaymentId: number;
  Extra?: TExtraInfoArray;
}

export interface TGetUsersInfoRequest extends TTPApiPosRequest {
}

export interface TTPApiPosReportRequest extends TTPApiPosRequest {
  From: string;
  Till: string;
}

export interface TGetTurnoverReportRequest extends TTPApiPosReportRequest {
  UserId?: number;
  SalesAreaId?: number;
}

export interface TGetDetailedTurnoverReportRequest extends TTPApiPosReportRequest {
  SalesAreaId?: number;
  Extra?: TExtraInfoArray;
}

export interface TGetCancelledItemsReportRequest extends TTPApiPosReportRequest {
}

export interface TGetDepositsReportRequest extends TTPApiPosReportRequest {
  SalesAreaId?: number;
  Extra?: TExtraInfoArray;
}

export interface TGetInOutCashReportRequest extends TTPApiPosReportRequest {
  Extra?: TExtraInfoArray;
}

export interface TPrintReportRequest extends TTPApiPosReportRequest {
  LayoutId: number;
  PrinterId?: number;
  Arguments?: TKeyValueArray;
  Extra?: TExtraInfoArray;
}

export interface TGetSmartcardDepositsReportRequest extends TTPApiPosReportRequest {
  Extra?: TExtraInfoArray;
}

export interface TGetVoucherPaymentsReportRequest extends TTPApiPosReportRequest {
  Extra?: TExtraInfoArray;
}

export interface TGetCardDepositsReportRequest extends TTPApiPosReportRequest {
  Extra?: TExtraInfoArray;
}

export interface TGetTimeAttendanceRequest extends TTPApiPosReportRequest {
  UserId?: number;
}

export interface TGetClientsRequest extends TTPApiPosRequest {
}

export interface TGetVersionRequest extends TTPApiPosRequest {
}

export interface TClientAccountDepositRequest extends TTPApiPosRequest {
  ClientId: number;
  PaymentId: number;
  Amount: number;
  Extra?: TExtraInfoArray;
}

export interface TUpdateClientsRequest extends TTPApiPosRequest {
  Clients: TClientsArray;
  Extra?: TExtraInfoArray;
}

export interface TUpdateUsersRequest extends TTPApiPosRequest {
  Users: TUserInfoArray;
  Extra?: TExtraInfoArray;
}

export interface TGetClientsExRequest extends TTPApiPosRequest {
  ModifiedSince?: string;
  Extra?: TExtraInfoArray;
}

export interface TNextCourseRequest extends TTPApiPosRequest {
  TableNumber: number;
  TablePart: string;
  Extra?: TExtraInfoArray;
}

export interface TSetTableCourseRequest extends TTPApiPosRequest {
  TableNumber: number;
  TablePart: string;
  CourseId: number;
  Extra?: TExtraInfoArray;
}

export interface TGetActiveTableInfoRequest extends TTPApiPosRequest {
  TableNumber: number;
  TablePart: string;
  Extra?: TExtraInfoArray;
}

export interface TGetActiveTableInfoExRequest extends TTPApiPosRequest {
  Extra?: TExtraInfoArray;
  Conditions: TExtraInfoArray;
}

export interface TFindTransactionsRequest extends TTPApiPosRequest {
  Conditions: TExtraInfoArray;
  Limit?: number;
  Desc?: boolean;
  Extra?: TExtraInfoArray;
}

export interface TGetServerInfoRequest extends TTPApiPosRequest {
  Extra?: TExtraInfoArray;
}

export interface TGetBOStatusRequest extends TTPApiPosRequest {
  Extra?: TExtraInfoArray;
}

export interface TPayRequest extends TTPApiPosRequest {
  TableNumber: number;
  TablePart: string;
  PaymentId: number;
  Amount?: number;
  EFTData?: string;
  Extra?: TExtraInfoArray;
}

export interface TPrintProformaRequest extends TTPApiPosRequest {
  TableNumber: number;
  TablePart: string;
  Extra?: TExtraInfoArray;
}

export interface TGetCountriesRequest extends TTPApiPosRequest {
  Extra?: TExtraInfoArray;
}

export interface TUpdateCountriesRequest extends TTPApiPosRequest {
  Countries: TCountriesArray;
  Extra?: TExtraInfoArray;
}

export interface TGetDiscountGroupsInfoRequest extends TTPApiPosRequest {
  Extra?: TExtraInfoArray;
}

export interface TAddPouringRequest extends TTPApiPosRequest {
  Pourings: TPouringsArray;
  Extra?: TExtraInfoArray;
}

export interface TGetCoursesRequest extends TTPApiPosRequest {
  Extra?: TExtraInfoArray;
}

export interface TGetVoidReasonsRequest extends TTPApiPosRequest {
  Extra?: TExtraInfoArray;
}

export interface TGetDiscountReasonsRequest extends TTPApiPosRequest {
  Extra?: TExtraInfoArray;
}

export interface TGetPOSStatusRequest extends TTPApiPosRequest {
  Extra: TExtraInfoArray;
}

export interface TUpdateSalesAreaPriceRequest extends TTPApiPosRequest {
  SalesAreaId: number;
  PriceId: number;
  Extra?: TExtraInfoArray;
}

export interface TGetSuppliersInfoRequest extends TTPApiPosRequest {
  Extra?: TExtraInfoArray;
}

export interface TGetVouchersInfoRequest extends TTPApiPosRequest {
  Extra?: TExtraInfoArray;
}

export interface TGetSmartcardGroupsInfoRequest extends TTPApiPosRequest {
  Extra?: TExtraInfoArray;
}

export interface TGetSmartcardsInfoRequest extends TTPApiPosRequest {
  Extra?: TExtraInfoArray;
}

export interface TGetPrintersInfoRequest extends TTPApiPosRequest {
  Extra?: TExtraInfoArray;
}

export interface TGetSizeModifiersInfoRequest extends TTPApiPosRequest {
  Extra?: TExtraInfoArray;
}

export interface TGetAllergensInfoRequest extends TTPApiPosRequest {
  Extra?: TExtraInfoArray;
}

export interface TGetTableItemsInfoRequest extends TTPApiPosRequest {
  TableNumber: number;
  TablePart: string;
  Extra?: TExtraInfoArray;
}

export interface TApplyDiscountToItemsRequest extends TTPApiPosRequest {
  TableNumber: number;
  TablePart: string;
  DiscountReason?: number;
  Description?: string;
  Discount: number;
  PercentValue?: boolean;
  Items: TDiscountedItemArray;
  Extra?: TExtraInfoArray;
}

export type TDiscountedItemArray = TDiscountedItem[];

export interface TDiscountedItem {
  Signature: string;
  Quantity: number;
}

export interface TApplyDiscountToTableRequest extends TTPApiPosRequest {
  TableNumber: number;
  TablePart: string;
  DiscountReason?: number;
  Description?: string;
  Discount: number;
  Extra?: TExtraInfoArray;
}

export interface TAddClientSavepointsRequest extends TTPApiPosRequest {
  ClientId: number;
  Quantity: number;
  Comments?: string;
  Extra?: TExtraInfoArray;
}

export interface TGetClientCardNamesInfoRequest extends TTPApiPosRequest {
  Extra?: TExtraInfoArray;
}

export interface TGetClientCardsInfoRequest extends TTPApiPosRequest {
  ClientId?: number;
  Extra?: TExtraInfoArray;
}

export interface TUpdateClientCardsRequest extends TTPApiPosRequest {
  Cards: TClientCardInfoArray;
  Extra?: TExtraInfoArray;
}

export interface TReadHotelGuestInfoRequest extends TTPApiPosRequest {
  PaymentId: number;
  Criteria: string;
  Value: string;
  Sequence?: number;
  Extra?: TExtraInfoArray;
}

export interface TSendMessageRequest extends TTPApiPosRequest {
  Users?: TInt64Array;
  Printers?: TInt64Array;
  Text: string;
  Extra?: TExtraInfoArray;
}

export interface TD3TimeRequest extends TTPApiPosRequest {
  TableNumber: number;
  TablePart: string;
  D3Datetime: string;
  Extra: TExtraInfoArray;
}

export interface TGetTimeAttendanceResponse extends TTPApiPosResponse {
  Data: TTimeAttendanceRecordArray;
  Extra: TExtraInfoArray;
}

export interface TGetUsersInfoResponse extends TTPApiPosResponse {
  Users: TUserInfoArray;
  Extra: TExtraInfoArray;
}

export interface TGetDetailedTurnoverReportResponse extends TTPApiPosResponse {
  Data: TTurnoverTransactionArray;
  Extra: TExtraInfoArray;
}

export interface TCreateOrderResponse extends TTPApiPosResponse {
}

export interface TCloseOrderResponse extends TTPApiPosResponse {
}

export interface TGetArticlesResponse extends TTPApiPosResponse {
  Articles: TArticleShortArray;
  Extra: TExtraInfoArray;
}

export interface TGetArticlesInfoResponse extends TTPApiPosResponse {
  Articles: TArticleInfoArray;
  Extra: TExtraInfoArray;
}

export interface TGetOptionsInfoResponse extends TTPApiPosResponse {
  Options: TOptionInfoArray;
  Extra: TExtraInfoArray;
}

export interface TGetPricesInfoResponse extends TTPApiPosResponse {
  Prices: TPriceInfoArray;
  Extra: TExtraInfoArray;
}

export interface TGetPeriodsInfoResponse extends TTPApiPosResponse {
  Period: TPeriodInfoArray;
  Extra: TExtraInfoArray;
}

export interface TGetDepartmentsInfoResponse extends TTPApiPosResponse {
  Departments: TDepartmentInfoArray;
  Extra: TExtraInfoArray;
}

export interface TGetGroupsInfoResponse extends TTPApiPosResponse {
  Groups: TGroupInfoArray;
  Extra: TExtraInfoArray;
}

export interface TGetCategoriesInfoResponse extends TTPApiPosResponse {
  Categories: TCategoryInfoArray;
  Extra: TExtraInfoArray;
}

export interface TGetPaymentsInfoResponse extends TTPApiPosResponse {
  Payments: TPaymentInfoArray;
  Extra: TExtraInfoArray;
}

export interface TGetSalesAreasInfoResponse extends TTPApiPosResponse {
  SalesAreas: TSalesAreaInfoArray;
  Extra: TExtraInfoArray;
}

export interface TGetActiveOrdersResponse extends TTPApiPosResponse {
  Orders: TOrderInfoArray;
  Extra: TExtraInfoArray;
}

export interface TPosRestartResponse extends TTPApiPosResponse {
}

export interface TGetTurnoverReportResponse extends TTPApiPosResponse {
  Data: TTurnoverBillArray;
  Extra: TExtraInfoArray;
}

export interface TGetClientsResponse extends TTPApiPosResponse {
  Clients: TClientsArray;
  Extra: TExtraInfoArray;
}

export interface TGetVersionResponse extends TTPApiPosResponse {
  Major: number;
  Minor: number;
  Extra: TExtraInfoArray;
}

export interface TGetCancelledItemsReportResponse extends TTPApiPosResponse {
  Items: TCancelledItemsArray;
  Extra: TExtraInfoArray;
}

export interface TClientAccountDepositResponse extends TTPApiPosResponse {
  OldBalance: number;
  NewBalance: number;
  Extra: TExtraInfoArray;
}

export interface TUpdateClientsResponse extends TTPApiPosResponse {
  AddedClients: number;
  UpdatedClients: number;
  Extra: TExtraInfoArray;
}

export interface TUpdateUsersResponse extends TTPApiPosResponse {
  AddedUsers: number;
  UpdatedUsers: number;
  Extra: TExtraInfoArray;
}

export interface TNextCourseResponse extends TTPApiPosResponse {
}

export interface TSetTableCourseResponse extends TTPApiPosResponse {
}

export interface TGetActiveTableInfoResponse extends TTPApiPosResponse {
  Transaction: TTurnoverTransaction;
  TotalAmount: number;
  RemainingAmount: number;
  ExtraAmount: number;
  Extra: TExtraInfoArray;
}

export interface TFindTransactionsResponse extends TTPApiPosResponse {
  Transactions: TTurnoverTransactionArray;
  Extra: TExtraInfoArray;
}

export interface TGetServerInfoResponse extends TTPApiPosResponse {
  DateTime: string;
  Extra: TExtraInfoArray;
}

export interface TGetBOStatusResponse extends TTPApiPosResponse {
  CurrentSignature: string;
  Extra: TExtraInfoArray;
}

export interface TPayResponse extends TTPApiPosResponse {
  Extra: TExtraInfoArray;
}

export interface TGetDepositsReportResponse extends TTPApiPosResponse {
  Items: TDepositItemArray;
  Extra: TExtraInfoArray;
}

export interface TGetInOutCashReportResponse extends TTPApiPosResponse {
  Items: TInOutCashItemArray;
  Extra: TExtraInfoArray;
}

export interface TPrintProformaResponse extends TTPApiPosResponse {
  Extra: TExtraInfoArray;
}

export interface TGetCountriesResponse extends TTPApiPosResponse {
  Countries: TCountriesArray;
  Extra: TExtraInfoArray;
}

export interface TUpdateCountriesResponse extends TTPApiPosResponse {
  AddedCountries: number;
  UpdatedCountries: number;
  Extra: TExtraInfoArray;
}

export interface TPrintReportResponse extends TTPApiPosResponse {
  Extra: TExtraInfoArray;
}

export interface TGetDiscountGroupsInfoResponse extends TTPApiPosResponse {
  DiscountGroups: TDiscountGroupInfoArray;
  Extra: TExtraInfoArray;
}

export interface TAddPouringResponse extends TTPApiPosResponse {
  Extra: TExtraInfoArray;
}

export interface TGetCoursesResponse extends TTPApiPosResponse {
  Extra: TExtraInfoArray;
  Courses: TCoursesArray;
}

export interface TGetVoidReasonsResponse extends TTPApiPosResponse {
  Extra: TExtraInfoArray;
  Items: TReasonsArray;
}

export interface TGetDiscountReasonsResponse extends TTPApiPosResponse {
  Extra: TExtraInfoArray;
  Items: TReasonsArray;
}

export interface TGetPOSStatusResponse extends TTPApiPosResponse {
  Extra: TExtraInfoArray;
}

export interface TUpdateSalesAreaPriceResponse extends TTPApiPosResponse {
  Extra: TExtraInfoArray;
}

export interface TGetSuppliersInfoResponse extends TTPApiPosResponse {
  Items: TSupplierInfoArray;
  Extra: TExtraInfoArray;
}

export interface TGetVouchersInfoResponse extends TTPApiPosResponse {
  Items: TVoucherInfoArray;
  Extra: TExtraInfoArray;
}

export interface TGetSmartcardGroupsInfoResponse extends TTPApiPosResponse {
  Items: TSmartCardGroupInfoArray;
  Extra: TExtraInfoArray;
}

export interface TGetSmartcardsInfoResponse extends TTPApiPosResponse {
  Items: TSmartCardInfoArray;
  Extra: TExtraInfoArray;
}

export interface TGetSmartcardDepositsReportResponse extends TTPApiPosResponse {
  Items: TSmartcardDepositReportItemArray;
  Extra: TExtraInfoArray;
}

export interface TGetPrintersInfoResponse extends TTPApiPosResponse {
  Printers: TPrinterInfoArray;
  Extra: TExtraInfoArray;
}

export interface TGetSizeModifiersInfoResponse extends TTPApiPosResponse {
  SizeModifiers: TSizeModifierInfoArray;
  Extra: TExtraInfoArray;
}

export interface TGetAllergensInfoResponse extends TTPApiPosResponse {
  Allergens: TAllergensInfoArray;
}

export interface TGetTableItemsInfoResponse extends TTPApiPosResponse {
  OpenDateTime: string;
  TableNumber: number;
  TablePart: string;
  Covers: number;
  UserId: number;
  DiscountOnTotal: number;
  ServiceCharge: number;
  ClientId: number;
  Items: TTableItemArray;
  Extra: TExtraInfoArray;
}

export interface TApplyDiscountToItemsResponse extends TTPApiPosResponse {
  Extra: TExtraInfoArray;
}

export interface TApplyDiscountToTableResponse extends TTPApiPosResponse {
  Extra: TExtraInfoArray;
}

export interface TGetVoucherPaymentsReportResponse extends TTPApiPosResponse {
  Items: TVoucherPaymentItemArray;
  Extra: TExtraInfoArray;
}

export interface TAddClientSavepointsResponse extends TTPApiPosResponse {
  SavepointsBalance: number;
  Extra: TExtraInfoArray;
}

export interface TGetClientCardNamesInfoResponse extends TTPApiPosResponse {
  Items: TClientCardNameInfoArray;
  Extra: TExtraInfoArray;
}

export interface TGetClientCardsInfoResponse extends TTPApiPosResponse {
  Items: TClientCardInfoArray;
  Extra: TExtraInfoArray;
}

export interface TUpdateClientCardsResponse extends TTPApiPosResponse {
  Extra: TExtraInfoArray;
}

export interface TReadHotelGuestInfoResponse extends TTPApiPosResponse {
  Guests: THotelGuestInfoArray;
  Extra: TExtraInfoArray;
}

export interface TGetCardDepositsReportResponse extends TTPApiPosResponse {
  Items: TCardDepositItemArray;
  Extra: TExtraInfoArray;
}

export interface TSendMessageResponse extends TTPApiPosResponse {
  Extra: TExtraInfoArray;
}

export interface TD3TimeResponse extends TTPApiPosResponse {
}

// GENERATED FROM ITPAPIPOS.wsdl — DO NOT EDIT BY HAND.
// Regenerate: pnpm --filter @kiosk/tpapi-discovery generate


export type FieldMeta = { name: string; type: string; optional: boolean };
export type TypeMeta =
  | { kind: "complex"; base?: string; fields: FieldMeta[] }
  | { kind: "array"; itemType: string }
  | { kind: "enum"; base: string; values: string[] };
export type OperationMeta = {
  soapAction: string; partName: string; requestType: string;
  responsePart: string; responseType: string;
};

export const DEFAULT_ENDPOINT = "http://testapi.untill.com:3063/soap/ITPAPIPOS";
export const OPERATION_NAMESPACE = "urn:TPAPIPosIntfU-ITPAPIPOS";
export const NAMESPACES: Record<string, string> = {
  "ns1": "urn:TPAPIPosTypesU",
  "ns2": "urn:TPAPIPosIntfU"
};

export const TYPES: Record<string, TypeMeta> = {
  "TTPApiPosRequest": {
    "kind": "complex",
    "fields": [
      {
        "name": "Password",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "UserName",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "AppToken",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "AppName",
        "type": "xs:string",
        "optional": true
      }
    ]
  },
  "TPosRestartRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": []
  },
  "TExtraInfoArray": {
    "kind": "array",
    "itemType": "ns1:TExtraInfo"
  },
  "TExtraInfo": {
    "kind": "complex",
    "fields": [
      {
        "name": "Key",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Value",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TOrderItemArray": {
    "kind": "array",
    "itemType": "ns1:TOrderItem"
  },
  "TOrderItem": {
    "kind": "complex",
    "fields": [
      {
        "name": "ItemNumber",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "ArticleId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "OrderItemType",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Text",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "ManualPrice",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "Quantity",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TClientsArray": {
    "kind": "array",
    "itemType": "ns1:TClient"
  },
  "TClient": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Number",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Name",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Country",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "Phone",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "Fax",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "Email",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "Website",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "Address",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "Info",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "BirthDate",
        "type": "xs:dateTime",
        "optional": true
      },
      {
        "name": "CardNumber",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "Code",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "OnInvoice",
        "type": "xs:boolean",
        "optional": true
      },
      {
        "name": "PriceActive",
        "type": "xs:boolean",
        "optional": true
      },
      {
        "name": "Price",
        "type": "xs:long",
        "optional": true
      },
      {
        "name": "PromotionPrice",
        "type": "xs:long",
        "optional": true
      },
      {
        "name": "AccountBalance",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "AccountLimit",
        "type": "xs:double",
        "optional": true
      },
      {
        "name": "IsSharedAccount",
        "type": "xs:boolean",
        "optional": true
      },
      {
        "name": "SharedAccount",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "SavePoints",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "SaveAmount",
        "type": "xs:int",
        "optional": true
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TUserInfoArray": {
    "kind": "array",
    "itemType": "ns1:TUserInfo"
  },
  "TUserInfo": {
    "kind": "complex",
    "fields": [
      {
        "name": "UserId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "UserName",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "FirstName",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "LastName",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "Group",
        "type": "ns1:TUserGroup",
        "optional": true
      },
      {
        "name": "Credentials",
        "type": "ns1:TCredentialArray",
        "optional": true
      },
      {
        "name": "Language",
        "type": "ns1:TLanguage",
        "optional": true
      },
      {
        "name": "Void",
        "type": "xs:boolean",
        "optional": true
      },
      {
        "name": "ClockIn",
        "type": "xs:boolean",
        "optional": true
      },
      {
        "name": "TagReaderCode",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "OperatorId",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "Address",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "Country",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "Phone",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "Birthdate",
        "type": "xs:dateTime",
        "optional": true
      },
      {
        "name": "Insurance",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "HourlyWage",
        "type": "xs:double",
        "optional": true
      },
      {
        "name": "HourlyWages",
        "type": "ns1:THourlyWageItemArray",
        "optional": true
      },
      {
        "name": "Void_number",
        "type": "xs:int",
        "optional": true
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TUserGroup": {
    "kind": "complex",
    "fields": [
      {
        "name": "GroupId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "GroupName",
        "type": "xs:string",
        "optional": false
      }
    ]
  },
  "TCredentialArray": {
    "kind": "array",
    "itemType": "ns1:TCredential"
  },
  "TLanguage": {
    "kind": "complex",
    "fields": [
      {
        "name": "LangCode",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Language",
        "type": "xs:string",
        "optional": false
      }
    ]
  },
  "THourlyWageItemArray": {
    "kind": "array",
    "itemType": "ns1:THourlyWageItem"
  },
  "TCredential": {
    "kind": "complex",
    "fields": [
      {
        "name": "CredentialGuid",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "CredentialName",
        "type": "xs:string",
        "optional": false
      }
    ]
  },
  "THourlyWageItem": {
    "kind": "complex",
    "fields": [
      {
        "name": "Position",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "HourlyWage",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "HourlyWageOvertime",
        "type": "xs:double",
        "optional": false
      }
    ]
  },
  "TCountriesArray": {
    "kind": "array",
    "itemType": "ns1:TCountry"
  },
  "TCountry": {
    "kind": "complex",
    "fields": [
      {
        "name": "CountryId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "CountryName",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Kind",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TKeyValueArray": {
    "kind": "array",
    "itemType": "ns1:TKeyValue"
  },
  "TKeyValue": {
    "kind": "complex",
    "fields": [
      {
        "name": "Key",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Value",
        "type": "xs:string",
        "optional": false
      }
    ]
  },
  "TPouringsArray": {
    "kind": "array",
    "itemType": "ns1:TPouring"
  },
  "TPouring": {
    "kind": "complex",
    "fields": [
      {
        "name": "TableNumber",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "PLU",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "DateTime",
        "type": "xs:dateTime",
        "optional": false
      },
      {
        "name": "Quantity",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "WaiterID",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "ExternalID",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "ExternalUID",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "ClientCard",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "LCU",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TClientCardInfoArray": {
    "kind": "array",
    "itemType": "ns1:TClientCardInfo"
  },
  "TClientCardInfo": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Number",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "ClientId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "CardNameId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Card",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "IsActive",
        "type": "xs:boolean",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TInt64Array": {
    "kind": "array",
    "itemType": "xs:long"
  },
  "TTPApiPosResponse": {
    "kind": "complex",
    "fields": [
      {
        "name": "ReturnCode",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "ReturnMessage",
        "type": "xs:string",
        "optional": false
      }
    ]
  },
  "TTimeAttendanceRecordArray": {
    "kind": "array",
    "itemType": "ns1:TTimeAttendanceRecord"
  },
  "TTimeAttendanceRecord": {
    "kind": "complex",
    "fields": [
      {
        "name": "UserId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Start",
        "type": "xs:dateTime",
        "optional": false
      },
      {
        "name": "Stop",
        "type": "xs:dateTime",
        "optional": false
      },
      {
        "name": "TotalTime",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "TotalDecimal",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "TotalCosts",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TTurnoverTransactionArray": {
    "kind": "array",
    "itemType": "ns1:TTurnoverTransaction"
  },
  "TTurnoverTransaction": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "OpenDateTime",
        "type": "xs:dateTime",
        "optional": false
      },
      {
        "name": "CloseDateTime",
        "type": "xs:dateTime",
        "optional": false
      },
      {
        "name": "TranNumber",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "TableNumber",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "TablePart",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Covers",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "UserId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "DiscountOnTotal",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "ServiceCharge",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "ClientName",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Orders",
        "type": "ns1:TTransactionOrderArray",
        "optional": false
      },
      {
        "name": "Bills",
        "type": "ns1:TTransactionBillArray",
        "optional": false
      },
      {
        "name": "Proformas",
        "type": "ns1:TTransactionProformaArray",
        "optional": false
      },
      {
        "name": "BillReprints",
        "type": "ns1:TTransactionBillReprintArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      },
      {
        "name": "ClientId",
        "type": "xs:long",
        "optional": false
      }
    ]
  },
  "TTransactionOrderArray": {
    "kind": "array",
    "itemType": "ns1:TTransactionOrder"
  },
  "TTransactionBillArray": {
    "kind": "array",
    "itemType": "ns1:TTransactionBill"
  },
  "TTransactionProformaArray": {
    "kind": "array",
    "itemType": "ns1:TTransactionProforma"
  },
  "TTransactionBillReprintArray": {
    "kind": "array",
    "itemType": "ns1:TTransactionBillReprint"
  },
  "TTransactionOrder": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "DateTime",
        "type": "xs:dateTime",
        "optional": false
      },
      {
        "name": "ComputerName",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "OrderNumber",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "UserId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "SalesAreaId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Items",
        "type": "ns1:TTransactionOrderItemArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TTransactionOrderItemArray": {
    "kind": "array",
    "itemType": "ns1:TTransactionOrderItem"
  },
  "TTransactionOrderItem": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "ArticleId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "ItemNumber",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Kind",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Quantity",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "SinglePrice",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "Price",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "Discount",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "Vat",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "VatPercent",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "Text",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "HqId",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TTableItem": {
    "kind": "complex",
    "base": "ns1:TTransactionOrderItem",
    "fields": [
      {
        "name": "Signature",
        "type": "xs:string",
        "optional": false
      }
    ]
  },
  "TTransactionBill": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "DateTime",
        "type": "xs:dateTime",
        "optional": false
      },
      {
        "name": "RealDateTime",
        "type": "xs:dateTime",
        "optional": false
      },
      {
        "name": "ComputerName",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "BillNumber",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "UserId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "ClientName",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "SalesAreaId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Tip",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "Payments",
        "type": "ns1:TTransactionBillPaymentArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      },
      {
        "name": "ClientId",
        "type": "xs:long",
        "optional": false
      }
    ]
  },
  "TTransactionBillPaymentArray": {
    "kind": "array",
    "itemType": "ns1:TTransactionBillPayment"
  },
  "TTransactionBillPayment": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "PaymentId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Amount",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TTransactionProforma": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "DateTime",
        "type": "xs:dateTime",
        "optional": false
      },
      {
        "name": "UserId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TTransactionBillReprint": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "DateTime",
        "type": "xs:dateTime",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TArticleShortArray": {
    "kind": "array",
    "itemType": "ns1:TArticleShort"
  },
  "TArticleShort": {
    "kind": "complex",
    "fields": [
      {
        "name": "ArticleId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "ArticleName",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "ArticleNumber",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "SalesAreaId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "DepartmentId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "HqId",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TArticleInfoArray": {
    "kind": "array",
    "itemType": "ns1:TArticleInfo"
  },
  "TArticleInfo": {
    "kind": "complex",
    "fields": [
      {
        "name": "ArticleId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "ArticleName",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "ArticleNumber",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Available",
        "type": "ns1:TInt64Array",
        "optional": false
      },
      {
        "name": "DepartmentId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Prices",
        "type": "ns1:TItemPriceArray",
        "optional": false
      },
      {
        "name": "FreeOption",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Options",
        "type": "ns1:TInt64Array",
        "optional": false
      },
      {
        "name": "IsMenu",
        "type": "xs:boolean",
        "optional": false
      },
      {
        "name": "IsManualPrice",
        "type": "xs:boolean",
        "optional": false
      },
      {
        "name": "IsActive",
        "type": "xs:boolean",
        "optional": false
      },
      {
        "name": "Promo",
        "type": "xs:boolean",
        "optional": false
      },
      {
        "name": "HqId",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TItemPriceArray": {
    "kind": "array",
    "itemType": "ns1:TItemPrice"
  },
  "TItemPrice": {
    "kind": "complex",
    "fields": [
      {
        "name": "ArticleId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "PriceId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Amount",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "Vat",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TOptionInfoArray": {
    "kind": "array",
    "itemType": "ns1:TOptionInfo"
  },
  "TOptionInfo": {
    "kind": "complex",
    "fields": [
      {
        "name": "OptionId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "OptionName",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Available",
        "type": "ns1:TInt64Array",
        "optional": false
      },
      {
        "name": "Items",
        "type": "ns1:TItemPriceArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TPriceInfoArray": {
    "kind": "array",
    "itemType": "ns1:TPriceInfo"
  },
  "TPriceInfo": {
    "kind": "complex",
    "fields": [
      {
        "name": "PriceId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "PriceName",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "HqId",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TPeriodInfoArray": {
    "kind": "array",
    "itemType": "ns1:TPeriodInfo"
  },
  "TPeriodInfo": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Name",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Values",
        "type": "ns1:TPeriodValuesArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TPeriodValuesArray": {
    "kind": "array",
    "itemType": "ns1:TPeriodValue"
  },
  "TPeriodValue": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Name",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "FromDay",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "ToDay",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "IsActive",
        "type": "xs:boolean",
        "optional": false
      },
      {
        "name": "FromTime",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "ToTime",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "ValueType",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "FromOneDay",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "ToOneDay",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TDepartmentInfoArray": {
    "kind": "array",
    "itemType": "ns1:TDepartmentInfo"
  },
  "TDepartmentInfo": {
    "kind": "complex",
    "fields": [
      {
        "name": "DepartmentId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "DepartmentNumber",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "DepartmentName",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Available",
        "type": "ns1:TInt64Array",
        "optional": false
      },
      {
        "name": "Supplement",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Condiment",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "GroupId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "SpecialArticles",
        "type": "ns1:TInt64Array",
        "optional": false
      },
      {
        "name": "HqId",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGroupInfoArray": {
    "kind": "array",
    "itemType": "ns1:TGroupInfo"
  },
  "TGroupInfo": {
    "kind": "complex",
    "fields": [
      {
        "name": "GroupId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "GroupName",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "CategoryId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "HqId",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TCategoryInfoArray": {
    "kind": "array",
    "itemType": "ns1:TCategoryInfo"
  },
  "TCategoryInfo": {
    "kind": "complex",
    "fields": [
      {
        "name": "CategoryId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "CategoryName",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "HqId",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TPaymentInfoArray": {
    "kind": "array",
    "itemType": "ns1:TPaymentInfo"
  },
  "TPaymentInfo": {
    "kind": "complex",
    "fields": [
      {
        "name": "PaymentId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "PaymentNumber",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "PaymentName",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "PaymentKind",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TSalesAreaInfoArray": {
    "kind": "array",
    "itemType": "ns1:TSalesAreaInfo"
  },
  "TSalesAreaInfo": {
    "kind": "complex",
    "fields": [
      {
        "name": "SalesAreaId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "SalesAreaNumber",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "SalesAreaName",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "PriceId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Tables",
        "type": "ns1:TTableRangeArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TTableRangeArray": {
    "kind": "array",
    "itemType": "ns1:TTableRange"
  },
  "TTableRange": {
    "kind": "complex",
    "fields": [
      {
        "name": "FromTable",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "ToTable",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TOrderInfoArray": {
    "kind": "array",
    "itemType": "ns1:TOrderInfo"
  },
  "TOrderInfo": {
    "kind": "complex",
    "fields": [
      {
        "name": "TableNumber",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "TablePart",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "OrderName",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "CientName",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "OrderDescr",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "SalesAreaId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TTurnoverBillArray": {
    "kind": "array",
    "itemType": "ns1:TTurnoverBill"
  },
  "TTurnoverBill": {
    "kind": "complex",
    "fields": [
      {
        "name": "OpenDateTime",
        "type": "xs:dateTime",
        "optional": false
      },
      {
        "name": "CloseDateTime",
        "type": "xs:dateTime",
        "optional": false
      },
      {
        "name": "ComputerName",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "BillNumber",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "BillSuffix",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "TableNumber",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "TablePart",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Covers",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "UserId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "SalesAreaId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Items",
        "type": "ns1:TTurnoverBillItemArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TTurnoverBillItemArray": {
    "kind": "array",
    "itemType": "ns1:TTurnoverBillItem"
  },
  "TTurnoverBillItem": {
    "kind": "complex",
    "fields": [
      {
        "name": "ArticleId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "DateTime",
        "type": "xs:dateTime",
        "optional": false
      },
      {
        "name": "ItemNumber",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "ComputerName",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Quantity",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Price",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "Vat",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "UserId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "HqId",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TCancelledItemsArray": {
    "kind": "array",
    "itemType": "ns1:TCancelledItem"
  },
  "TCancelledItem": {
    "kind": "complex",
    "fields": [
      {
        "name": "ArticleId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "DateTime",
        "type": "xs:dateTime",
        "optional": false
      },
      {
        "name": "UserId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "TableNo",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "TablePart",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Quantity",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Price",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "PriceId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TDepositItemArray": {
    "kind": "array",
    "itemType": "ns1:TDepositItem"
  },
  "TDepositItem": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "SalesAreaId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "ClientId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Amount",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "Comments",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "PaymentId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "ComputerName",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "UserId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "DateTime",
        "type": "xs:dateTime",
        "optional": false
      },
      {
        "name": "DepositNumber",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TInOutCashItemArray": {
    "kind": "array",
    "itemType": "ns1:TInOutCashItem"
  },
  "TInOutCashItem": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "DateTime",
        "type": "xs:dateTime",
        "optional": false
      },
      {
        "name": "ComputerName",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "UserId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Amount",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "Reason",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Supplier",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TDiscountGroupInfoArray": {
    "kind": "array",
    "itemType": "ns1:TDiscountGroupInfo"
  },
  "TDiscountGroupInfo": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Name",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Barcode",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "DiscountValue",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "CheapestArticleDiscountedOnly",
        "type": "xs:boolean",
        "optional": false
      },
      {
        "name": "Articles",
        "type": "ns1:TArticleDiscountItemInfoArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TArticleDiscountItemInfoArray": {
    "kind": "array",
    "itemType": "ns1:TArticleDiscountItemInfo"
  },
  "TArticleDiscountItemInfo": {
    "kind": "complex",
    "fields": [
      {
        "name": "ArticleId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "DiscountPercent",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TCoursesArray": {
    "kind": "array",
    "itemType": "ns1:TCourse"
  },
  "TCourse": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Name",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Number",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Separate",
        "type": "xs:boolean",
        "optional": false
      },
      {
        "name": "Changeable",
        "type": "xs:boolean",
        "optional": false
      },
      {
        "name": "AutoFire",
        "type": "xs:boolean",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TReasonsArray": {
    "kind": "array",
    "itemType": "ns1:TReason"
  },
  "TReason": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Name",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Number",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TSupplierInfoArray": {
    "kind": "array",
    "itemType": "ns1:TSupplierInfo"
  },
  "TSupplierInfo": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Name",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Number",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Address",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "AccountNumber",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TVoucherInfoArray": {
    "kind": "array",
    "itemType": "ns1:TVoucherInfo"
  },
  "TVoucherInfo": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Barcode",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Status",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "OriginalValue",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "RemainingValue",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "CreationDate",
        "type": "xs:dateTime",
        "optional": false
      },
      {
        "name": "ExpirationDate",
        "type": "xs:dateTime",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TSmartCardGroupInfoArray": {
    "kind": "array",
    "itemType": "ns1:TSmartCardGroupInfo"
  },
  "TSmartCardGroupInfo": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Name",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Description",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Kind",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "PriceId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TSmartCardInfoArray": {
    "kind": "array",
    "itemType": "ns1:TSmartCardInfo"
  },
  "TSmartCardInfo": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "SmartcardGroupId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Uid",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "ClientId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TSmartcardDepositReportItemArray": {
    "kind": "array",
    "itemType": "ns1:TSmartcardDepositReportItem"
  },
  "TSmartcardDepositReportItem": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "DateTime",
        "type": "xs:dateTime",
        "optional": false
      },
      {
        "name": "SmartcardId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "UserId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "PaymentId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Number",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "PCName",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Amount",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "Initial",
        "type": "xs:boolean",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TPrinterInfoArray": {
    "kind": "array",
    "itemType": "ns1:TPrinterInfo"
  },
  "TPrinterInfo": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Name",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Guid",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "NullPrinter",
        "type": "xs:boolean",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TSizeModifierInfoArray": {
    "kind": "array",
    "itemType": "ns1:TSizeModifierInfo"
  },
  "TSizeModifierInfo": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Number",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Name",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "IsActive",
        "type": "xs:boolean",
        "optional": false
      },
      {
        "name": "Items",
        "type": "ns1:TSizeModifierItemInfoArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TSizeModifierItemInfoArray": {
    "kind": "array",
    "itemType": "ns1:TSizeModifierItemInfo"
  },
  "TSizeModifierItemInfo": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Number",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Name",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "IsActive",
        "type": "xs:boolean",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TAllergensInfoArray": {
    "kind": "array",
    "itemType": "ns1:TAllergenInfo"
  },
  "TAllergenInfo": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Number",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Name",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Description",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "IsActive",
        "type": "xs:boolean",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TTableItemArray": {
    "kind": "array",
    "itemType": "ns1:TTableItem"
  },
  "TVoucherPaymentItemArray": {
    "kind": "array",
    "itemType": "ns1:TVoucherPaymentItem"
  },
  "TVoucherPaymentItem": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "DateTime",
        "type": "xs:dateTime",
        "optional": false
      },
      {
        "name": "ComputerName",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "UserId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Barcode",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "PaymentId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Amount",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TClientCardNameInfoArray": {
    "kind": "array",
    "itemType": "ns1:TClientCardNameInfo"
  },
  "TClientCardNameInfo": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Name",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "IsActive",
        "type": "xs:boolean",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "THotelGuestInfoArray": {
    "kind": "array",
    "itemType": "ns1:THotelGuestInfo"
  },
  "THotelGuestInfo": {
    "kind": "complex",
    "fields": [
      {
        "name": "Room",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Sequence",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Name",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "ReservationId",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      },
      {
        "name": "ExtraDisplayInfo",
        "type": "ns1:TKeyValueArray",
        "optional": false
      }
    ]
  },
  "TCardDepositItemArray": {
    "kind": "array",
    "itemType": "ns1:TCardDepositItem"
  },
  "TCardDepositItem": {
    "kind": "complex",
    "fields": [
      {
        "name": "Id",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "DateTime",
        "type": "xs:dateTime",
        "optional": false
      },
      {
        "name": "UserId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Amount",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "ComputerName",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "PaymentId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "DepositNumber",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetArticlesRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "SalesAreaId",
        "type": "xs:long",
        "optional": true
      }
    ]
  },
  "TGetArticlesInfoRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "ArticleId",
        "type": "xs:long",
        "optional": true
      },
      {
        "name": "SalesAreaId",
        "type": "xs:long",
        "optional": true
      },
      {
        "name": "GetInactive",
        "type": "xs:boolean",
        "optional": true
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetOptionsInfoRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "OptionId",
        "type": "xs:long",
        "optional": true
      },
      {
        "name": "SalesAreaId",
        "type": "xs:long",
        "optional": true
      }
    ]
  },
  "TGetPricesInfoRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": []
  },
  "TGetPeriodsInfoRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": []
  },
  "TGetDepartmentsInfoRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "SalesAreaId",
        "type": "xs:long",
        "optional": true
      },
      {
        "name": "DepartmentId",
        "type": "xs:long",
        "optional": true
      }
    ]
  },
  "TGetGroupsInfoRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": []
  },
  "TGetCategoriesInfoRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": []
  },
  "TGetPaymentsInfoRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": []
  },
  "TGetSalesAreasInfoRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": []
  },
  "TGetActiveOrdersRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "SalesAreaId",
        "type": "xs:long",
        "optional": true
      }
    ]
  },
  "TCreateOrderRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "TableNumber",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "TablePart",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "ClientName",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "OrderName",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "OrderDescr",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "Items",
        "type": "ns1:TOrderItemArray",
        "optional": false
      },
      {
        "name": "Covers",
        "type": "xs:int",
        "optional": true
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      },
      {
        "name": "ClientId",
        "type": "xs:long",
        "optional": true
      }
    ]
  },
  "TCloseOrderRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "TableNumber",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "TablePart",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "PaymentId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetUsersInfoRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": []
  },
  "TTPApiPosReportRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "From",
        "type": "xs:dateTime",
        "optional": false
      },
      {
        "name": "Till",
        "type": "xs:dateTime",
        "optional": false
      }
    ]
  },
  "TGetTurnoverReportRequest": {
    "kind": "complex",
    "base": "ns2:TTPApiPosReportRequest",
    "fields": [
      {
        "name": "UserId",
        "type": "xs:long",
        "optional": true
      },
      {
        "name": "SalesAreaId",
        "type": "xs:long",
        "optional": true
      }
    ]
  },
  "TGetDetailedTurnoverReportRequest": {
    "kind": "complex",
    "base": "ns2:TTPApiPosReportRequest",
    "fields": [
      {
        "name": "SalesAreaId",
        "type": "xs:long",
        "optional": true
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetCancelledItemsReportRequest": {
    "kind": "complex",
    "base": "ns2:TTPApiPosReportRequest",
    "fields": []
  },
  "TGetDepositsReportRequest": {
    "kind": "complex",
    "base": "ns2:TTPApiPosReportRequest",
    "fields": [
      {
        "name": "SalesAreaId",
        "type": "xs:long",
        "optional": true
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetInOutCashReportRequest": {
    "kind": "complex",
    "base": "ns2:TTPApiPosReportRequest",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TPrintReportRequest": {
    "kind": "complex",
    "base": "ns2:TTPApiPosReportRequest",
    "fields": [
      {
        "name": "LayoutId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "PrinterId",
        "type": "xs:long",
        "optional": true
      },
      {
        "name": "Arguments",
        "type": "ns1:TKeyValueArray",
        "optional": true
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetSmartcardDepositsReportRequest": {
    "kind": "complex",
    "base": "ns2:TTPApiPosReportRequest",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetVoucherPaymentsReportRequest": {
    "kind": "complex",
    "base": "ns2:TTPApiPosReportRequest",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetCardDepositsReportRequest": {
    "kind": "complex",
    "base": "ns2:TTPApiPosReportRequest",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetTimeAttendanceRequest": {
    "kind": "complex",
    "base": "ns2:TTPApiPosReportRequest",
    "fields": [
      {
        "name": "UserId",
        "type": "xs:long",
        "optional": true
      }
    ]
  },
  "TGetClientsRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": []
  },
  "TGetVersionRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": []
  },
  "TClientAccountDepositRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "ClientId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "PaymentId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Amount",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TUpdateClientsRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "Clients",
        "type": "ns1:TClientsArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TUpdateUsersRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "Users",
        "type": "ns1:TUserInfoArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetClientsExRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "ModifiedSince",
        "type": "xs:dateTime",
        "optional": true
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TNextCourseRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "TableNumber",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "TablePart",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TSetTableCourseRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "TableNumber",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "TablePart",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "CourseId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetActiveTableInfoRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "TableNumber",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "TablePart",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetActiveTableInfoExRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      },
      {
        "name": "Conditions",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TFindTransactionsRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "Conditions",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      },
      {
        "name": "Limit",
        "type": "xs:int",
        "optional": true
      },
      {
        "name": "Desc",
        "type": "xs:boolean",
        "optional": true
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetServerInfoRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetBOStatusRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TPayRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "TableNumber",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "TablePart",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "PaymentId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Amount",
        "type": "xs:double",
        "optional": true
      },
      {
        "name": "EFTData",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TPrintProformaRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "TableNumber",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "TablePart",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetCountriesRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TUpdateCountriesRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "Countries",
        "type": "ns1:TCountriesArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetDiscountGroupsInfoRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TAddPouringRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "Pourings",
        "type": "ns1:TPouringsArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetCoursesRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetVoidReasonsRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetDiscountReasonsRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetPOSStatusRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TUpdateSalesAreaPriceRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "SalesAreaId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "PriceId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetSuppliersInfoRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetVouchersInfoRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetSmartcardGroupsInfoRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetSmartcardsInfoRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetPrintersInfoRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetSizeModifiersInfoRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetAllergensInfoRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetTableItemsInfoRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "TableNumber",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "TablePart",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TApplyDiscountToItemsRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "TableNumber",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "TablePart",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "DiscountReason",
        "type": "xs:long",
        "optional": true
      },
      {
        "name": "Description",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "Discount",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "PercentValue",
        "type": "xs:boolean",
        "optional": true
      },
      {
        "name": "Items",
        "type": "ns2:TDiscountedItemArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TDiscountedItemArray": {
    "kind": "array",
    "itemType": "ns2:TDiscountedItem"
  },
  "TDiscountedItem": {
    "kind": "complex",
    "fields": [
      {
        "name": "Signature",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Quantity",
        "type": "xs:int",
        "optional": false
      }
    ]
  },
  "TApplyDiscountToTableRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "TableNumber",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "TablePart",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "DiscountReason",
        "type": "xs:long",
        "optional": true
      },
      {
        "name": "Description",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "Discount",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TAddClientSavepointsRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "ClientId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Quantity",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Comments",
        "type": "xs:string",
        "optional": true
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetClientCardNamesInfoRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TGetClientCardsInfoRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "ClientId",
        "type": "xs:long",
        "optional": true
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TUpdateClientCardsRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "Cards",
        "type": "ns1:TClientCardInfoArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TReadHotelGuestInfoRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "PaymentId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Criteria",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Value",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Sequence",
        "type": "xs:int",
        "optional": true
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TSendMessageRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "Users",
        "type": "ns1:TInt64Array",
        "optional": true
      },
      {
        "name": "Printers",
        "type": "ns1:TInt64Array",
        "optional": true
      },
      {
        "name": "Text",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": true
      }
    ]
  },
  "TD3TimeRequest": {
    "kind": "complex",
    "base": "ns1:TTPApiPosRequest",
    "fields": [
      {
        "name": "TableNumber",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "TablePart",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "D3Datetime",
        "type": "xs:dateTime",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetTimeAttendanceResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Data",
        "type": "ns1:TTimeAttendanceRecordArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetUsersInfoResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Users",
        "type": "ns1:TUserInfoArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetDetailedTurnoverReportResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Data",
        "type": "ns1:TTurnoverTransactionArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TCreateOrderResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": []
  },
  "TCloseOrderResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": []
  },
  "TGetArticlesResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Articles",
        "type": "ns1:TArticleShortArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetArticlesInfoResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Articles",
        "type": "ns1:TArticleInfoArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetOptionsInfoResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Options",
        "type": "ns1:TOptionInfoArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetPricesInfoResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Prices",
        "type": "ns1:TPriceInfoArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetPeriodsInfoResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Period",
        "type": "ns1:TPeriodInfoArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetDepartmentsInfoResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Departments",
        "type": "ns1:TDepartmentInfoArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetGroupsInfoResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Groups",
        "type": "ns1:TGroupInfoArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetCategoriesInfoResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Categories",
        "type": "ns1:TCategoryInfoArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetPaymentsInfoResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Payments",
        "type": "ns1:TPaymentInfoArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetSalesAreasInfoResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "SalesAreas",
        "type": "ns1:TSalesAreaInfoArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetActiveOrdersResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Orders",
        "type": "ns1:TOrderInfoArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TPosRestartResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": []
  },
  "TGetTurnoverReportResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Data",
        "type": "ns1:TTurnoverBillArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetClientsResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Clients",
        "type": "ns1:TClientsArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetVersionResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Major",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Minor",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetCancelledItemsReportResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Items",
        "type": "ns1:TCancelledItemsArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TClientAccountDepositResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "OldBalance",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "NewBalance",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TUpdateClientsResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "AddedClients",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "UpdatedClients",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TUpdateUsersResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "AddedUsers",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "UpdatedUsers",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TNextCourseResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": []
  },
  "TSetTableCourseResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": []
  },
  "TGetActiveTableInfoResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Transaction",
        "type": "ns1:TTurnoverTransaction",
        "optional": false
      },
      {
        "name": "TotalAmount",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "RemainingAmount",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "ExtraAmount",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TFindTransactionsResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Transactions",
        "type": "ns1:TTurnoverTransactionArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetServerInfoResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "DateTime",
        "type": "xs:dateTime",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetBOStatusResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "CurrentSignature",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TPayResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetDepositsReportResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Items",
        "type": "ns1:TDepositItemArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetInOutCashReportResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Items",
        "type": "ns1:TInOutCashItemArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TPrintProformaResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetCountriesResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Countries",
        "type": "ns1:TCountriesArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TUpdateCountriesResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "AddedCountries",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "UpdatedCountries",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TPrintReportResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetDiscountGroupsInfoResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "DiscountGroups",
        "type": "ns1:TDiscountGroupInfoArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TAddPouringResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetCoursesResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      },
      {
        "name": "Courses",
        "type": "ns1:TCoursesArray",
        "optional": false
      }
    ]
  },
  "TGetVoidReasonsResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      },
      {
        "name": "Items",
        "type": "ns1:TReasonsArray",
        "optional": false
      }
    ]
  },
  "TGetDiscountReasonsResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      },
      {
        "name": "Items",
        "type": "ns1:TReasonsArray",
        "optional": false
      }
    ]
  },
  "TGetPOSStatusResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TUpdateSalesAreaPriceResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetSuppliersInfoResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Items",
        "type": "ns1:TSupplierInfoArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetVouchersInfoResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Items",
        "type": "ns1:TVoucherInfoArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetSmartcardGroupsInfoResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Items",
        "type": "ns1:TSmartCardGroupInfoArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetSmartcardsInfoResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Items",
        "type": "ns1:TSmartCardInfoArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetSmartcardDepositsReportResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Items",
        "type": "ns1:TSmartcardDepositReportItemArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetPrintersInfoResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Printers",
        "type": "ns1:TPrinterInfoArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetSizeModifiersInfoResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "SizeModifiers",
        "type": "ns1:TSizeModifierInfoArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetAllergensInfoResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Allergens",
        "type": "ns1:TAllergensInfoArray",
        "optional": false
      }
    ]
  },
  "TGetTableItemsInfoResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "OpenDateTime",
        "type": "xs:dateTime",
        "optional": false
      },
      {
        "name": "TableNumber",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "TablePart",
        "type": "xs:string",
        "optional": false
      },
      {
        "name": "Covers",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "UserId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "DiscountOnTotal",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "ServiceCharge",
        "type": "xs:double",
        "optional": false
      },
      {
        "name": "ClientId",
        "type": "xs:long",
        "optional": false
      },
      {
        "name": "Items",
        "type": "ns1:TTableItemArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TApplyDiscountToItemsResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TApplyDiscountToTableResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetVoucherPaymentsReportResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Items",
        "type": "ns1:TVoucherPaymentItemArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TAddClientSavepointsResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "SavepointsBalance",
        "type": "xs:int",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetClientCardNamesInfoResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Items",
        "type": "ns1:TClientCardNameInfoArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetClientCardsInfoResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Items",
        "type": "ns1:TClientCardInfoArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TUpdateClientCardsResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TReadHotelGuestInfoResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Guests",
        "type": "ns1:THotelGuestInfoArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TGetCardDepositsReportResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Items",
        "type": "ns1:TCardDepositItemArray",
        "optional": false
      },
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TSendMessageResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": [
      {
        "name": "Extra",
        "type": "ns1:TExtraInfoArray",
        "optional": false
      }
    ]
  },
  "TD3TimeResponse": {
    "kind": "complex",
    "base": "ns1:TTPApiPosResponse",
    "fields": []
  }
};

export const OPERATIONS: Record<string, OperationMeta> = {
  "Ping": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#Ping",
    "partName": "Request",
    "requestType": "ns1:TTPApiPosRequest",
    "responsePart": "return",
    "responseType": "ns1:TTPApiPosResponse"
  },
  "GetArticles": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetArticles",
    "partName": "Request",
    "requestType": "ns2:TGetArticlesRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetArticlesResponse"
  },
  "GetArticlesInfo": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetArticlesInfo",
    "partName": "Request",
    "requestType": "ns2:TGetArticlesInfoRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetArticlesInfoResponse"
  },
  "GetOptionsInfo": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetOptionsInfo",
    "partName": "Request",
    "requestType": "ns2:TGetOptionsInfoRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetOptionsInfoResponse"
  },
  "GetPricesInfo": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetPricesInfo",
    "partName": "Request",
    "requestType": "ns2:TGetPricesInfoRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetPricesInfoResponse"
  },
  "GetPeriodsInfo": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetPeriodsInfo",
    "partName": "Request",
    "requestType": "ns2:TGetPeriodsInfoRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetPeriodsInfoResponse"
  },
  "GetDepartmentsInfo": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetDepartmentsInfo",
    "partName": "Request",
    "requestType": "ns2:TGetDepartmentsInfoRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetDepartmentsInfoResponse"
  },
  "GetGroupsInfo": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetGroupsInfo",
    "partName": "Request",
    "requestType": "ns2:TGetGroupsInfoRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetGroupsInfoResponse"
  },
  "GetCategoriesInfo": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetCategoriesInfo",
    "partName": "Request",
    "requestType": "ns2:TGetCategoriesInfoRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetCategoriesInfoResponse"
  },
  "GetPaymentsInfo": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetPaymentsInfo",
    "partName": "Request",
    "requestType": "ns2:TGetPaymentsInfoRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetPaymentsInfoResponse"
  },
  "GetSalesAreasInfo": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetSalesAreasInfo",
    "partName": "Request",
    "requestType": "ns2:TGetSalesAreasInfoRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetSalesAreasInfoResponse"
  },
  "GetActiveOrders": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetActiveOrders",
    "partName": "Request",
    "requestType": "ns2:TGetActiveOrdersRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetActiveOrdersResponse"
  },
  "CreateOrder": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#CreateOrder",
    "partName": "Request",
    "requestType": "ns2:TCreateOrderRequest",
    "responsePart": "return",
    "responseType": "ns2:TCreateOrderResponse"
  },
  "CloseOrder": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#CloseOrder",
    "partName": "Request",
    "requestType": "ns2:TCloseOrderRequest",
    "responsePart": "return",
    "responseType": "ns2:TCloseOrderResponse"
  },
  "PosRestart": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#PosRestart",
    "partName": "Request",
    "requestType": "ns1:TPosRestartRequest",
    "responsePart": "return",
    "responseType": "ns2:TPosRestartResponse"
  },
  "GetUsersInfo": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetUsersInfo",
    "partName": "Request",
    "requestType": "ns2:TGetUsersInfoRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetUsersInfoResponse"
  },
  "GetTimeAttendanceReport": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetTimeAttendanceReport",
    "partName": "Request",
    "requestType": "ns2:TGetTimeAttendanceRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetTimeAttendanceResponse"
  },
  "GetTurnoverReport": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetTurnoverReport",
    "partName": "Request",
    "requestType": "ns2:TGetTurnoverReportRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetTurnoverReportResponse"
  },
  "GetDetailedTurnoverReport": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetDetailedTurnoverReport",
    "partName": "Request",
    "requestType": "ns2:TGetDetailedTurnoverReportRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetDetailedTurnoverReportResponse"
  },
  "GetClients": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetClients",
    "partName": "Request",
    "requestType": "ns2:TGetClientsRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetClientsResponse"
  },
  "GetVersion": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetVersion",
    "partName": "Request",
    "requestType": "ns2:TGetVersionRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetVersionResponse"
  },
  "GetCancelledItemsReport": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetCancelledItemsReport",
    "partName": "Request",
    "requestType": "ns2:TGetCancelledItemsReportRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetCancelledItemsReportResponse"
  },
  "ClientDeposit": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#ClientDeposit",
    "partName": "Request",
    "requestType": "ns2:TClientAccountDepositRequest",
    "responsePart": "return",
    "responseType": "ns2:TClientAccountDepositResponse"
  },
  "UpdateClients": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#UpdateClients",
    "partName": "Request",
    "requestType": "ns2:TUpdateClientsRequest",
    "responsePart": "return",
    "responseType": "ns2:TUpdateClientsResponse"
  },
  "UpdateUsers": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#UpdateUsers",
    "partName": "Request",
    "requestType": "ns2:TUpdateUsersRequest",
    "responsePart": "return",
    "responseType": "ns2:TUpdateUsersResponse"
  },
  "GetClientsEx": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetClientsEx",
    "partName": "Request",
    "requestType": "ns2:TGetClientsExRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetClientsResponse"
  },
  "NextCourse": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#NextCourse",
    "partName": "Request",
    "requestType": "ns2:TNextCourseRequest",
    "responsePart": "return",
    "responseType": "ns2:TNextCourseResponse"
  },
  "SetTableCourse": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#SetTableCourse",
    "partName": "Request",
    "requestType": "ns2:TSetTableCourseRequest",
    "responsePart": "return",
    "responseType": "ns2:TSetTableCourseResponse"
  },
  "GetActiveTableInfo": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetActiveTableInfo",
    "partName": "Request",
    "requestType": "ns2:TGetActiveTableInfoRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetActiveTableInfoResponse"
  },
  "GetActiveTableInfoEx": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetActiveTableInfoEx",
    "partName": "Request",
    "requestType": "ns2:TGetActiveTableInfoExRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetActiveTableInfoResponse"
  },
  "FindTransactions": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#FindTransactions",
    "partName": "Request",
    "requestType": "ns2:TFindTransactionsRequest",
    "responsePart": "return",
    "responseType": "ns2:TFindTransactionsResponse"
  },
  "GetServerInfo": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetServerInfo",
    "partName": "Request",
    "requestType": "ns2:TGetServerInfoRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetServerInfoResponse"
  },
  "GetBOStatus": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetBOStatus",
    "partName": "Request",
    "requestType": "ns2:TGetBOStatusRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetBOStatusResponse"
  },
  "Pay": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#Pay",
    "partName": "Request",
    "requestType": "ns2:TPayRequest",
    "responsePart": "return",
    "responseType": "ns2:TPayResponse"
  },
  "GetDepositsReport": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetDepositsReport",
    "partName": "Request",
    "requestType": "ns2:TGetDepositsReportRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetDepositsReportResponse"
  },
  "GetInOutCashReport": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetInOutCashReport",
    "partName": "Request",
    "requestType": "ns2:TGetInOutCashReportRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetInOutCashReportResponse"
  },
  "PrintProforma": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#PrintProforma",
    "partName": "Request",
    "requestType": "ns2:TPrintProformaRequest",
    "responsePart": "return",
    "responseType": "ns2:TPrintProformaResponse"
  },
  "GetCountries": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetCountries",
    "partName": "Request",
    "requestType": "ns2:TGetCountriesRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetCountriesResponse"
  },
  "UpdateCountries": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#UpdateCountries",
    "partName": "Request",
    "requestType": "ns2:TUpdateCountriesRequest",
    "responsePart": "return",
    "responseType": "ns2:TUpdateCountriesResponse"
  },
  "PrintReport": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#PrintReport",
    "partName": "Request",
    "requestType": "ns2:TPrintReportRequest",
    "responsePart": "return",
    "responseType": "ns2:TPrintReportResponse"
  },
  "GetDiscountGroupsInfo": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetDiscountGroupsInfo",
    "partName": "Request",
    "requestType": "ns2:TGetDiscountGroupsInfoRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetDiscountGroupsInfoResponse"
  },
  "AddPouring": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#AddPouring",
    "partName": "Request",
    "requestType": "ns2:TAddPouringRequest",
    "responsePart": "return",
    "responseType": "ns2:TAddPouringResponse"
  },
  "GetCourses": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetCourses",
    "partName": "Request",
    "requestType": "ns2:TGetCoursesRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetCoursesResponse"
  },
  "GetVoidReasons": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetVoidReasons",
    "partName": "Request",
    "requestType": "ns2:TGetVoidReasonsRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetVoidReasonsResponse"
  },
  "GetDiscountReasons": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetDiscountReasons",
    "partName": "Request",
    "requestType": "ns2:TGetDiscountReasonsRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetDiscountReasonsResponse"
  },
  "GetPosStatus": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetPosStatus",
    "partName": "Request",
    "requestType": "ns2:TGetPOSStatusRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetPOSStatusResponse"
  },
  "UpdateSalesAreaPrice": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#UpdateSalesAreaPrice",
    "partName": "Request",
    "requestType": "ns2:TUpdateSalesAreaPriceRequest",
    "responsePart": "return",
    "responseType": "ns2:TUpdateSalesAreaPriceResponse"
  },
  "GetSuppliersInfo": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetSuppliersInfo",
    "partName": "Request",
    "requestType": "ns2:TGetSuppliersInfoRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetSuppliersInfoResponse"
  },
  "GetVouchersInfo": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetVouchersInfo",
    "partName": "Request",
    "requestType": "ns2:TGetVouchersInfoRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetVouchersInfoResponse"
  },
  "GetSmartcardGroupsInfo": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetSmartcardGroupsInfo",
    "partName": "Request",
    "requestType": "ns2:TGetSmartcardGroupsInfoRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetSmartcardGroupsInfoResponse"
  },
  "GetSmartcardsInfo": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetSmartcardsInfo",
    "partName": "Request",
    "requestType": "ns2:TGetSmartcardsInfoRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetSmartcardsInfoResponse"
  },
  "GetSmartcardDepositsReport": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetSmartcardDepositsReport",
    "partName": "Request",
    "requestType": "ns2:TGetSmartcardDepositsReportRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetSmartcardDepositsReportResponse"
  },
  "GetPrintersInfo": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetPrintersInfo",
    "partName": "Request",
    "requestType": "ns2:TGetPrintersInfoRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetPrintersInfoResponse"
  },
  "GetSizeModifiersInfo": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetSizeModifiersInfo",
    "partName": "Request",
    "requestType": "ns2:TGetSizeModifiersInfoRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetSizeModifiersInfoResponse"
  },
  "GetAllergensInfo": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetAllergensInfo",
    "partName": "Request",
    "requestType": "ns2:TGetAllergensInfoRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetAllergensInfoResponse"
  },
  "GetTableItemsInfo": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetTableItemsInfo",
    "partName": "Request",
    "requestType": "ns2:TGetTableItemsInfoRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetTableItemsInfoResponse"
  },
  "ApplyDiscountToItems": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#ApplyDiscountToItems",
    "partName": "Request",
    "requestType": "ns2:TApplyDiscountToItemsRequest",
    "responsePart": "return",
    "responseType": "ns2:TApplyDiscountToItemsResponse"
  },
  "ApplyDiscountToTable": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#ApplyDiscountToTable",
    "partName": "Request",
    "requestType": "ns2:TApplyDiscountToTableRequest",
    "responsePart": "return",
    "responseType": "ns2:TApplyDiscountToTableResponse"
  },
  "GetVoucherPaymentsReport": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetVoucherPaymentsReport",
    "partName": "Request",
    "requestType": "ns2:TGetVoucherPaymentsReportRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetVoucherPaymentsReportResponse"
  },
  "AddClientSavepoints": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#AddClientSavepoints",
    "partName": "Request",
    "requestType": "ns2:TAddClientSavepointsRequest",
    "responsePart": "return",
    "responseType": "ns2:TAddClientSavepointsResponse"
  },
  "GetClientCardNamesInfo": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetClientCardNamesInfo",
    "partName": "Request",
    "requestType": "ns2:TGetClientCardNamesInfoRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetClientCardNamesInfoResponse"
  },
  "GetClientCardsInfo": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetClientCardsInfo",
    "partName": "Request",
    "requestType": "ns2:TGetClientCardsInfoRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetClientCardsInfoResponse"
  },
  "UpdateClientCards": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#UpdateClientCards",
    "partName": "Request",
    "requestType": "ns2:TUpdateClientCardsRequest",
    "responsePart": "return",
    "responseType": "ns2:TUpdateClientCardsResponse"
  },
  "ReadHotelGuestInfo": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#ReadHotelGuestInfo",
    "partName": "Request",
    "requestType": "ns2:TReadHotelGuestInfoRequest",
    "responsePart": "return",
    "responseType": "ns2:TReadHotelGuestInfoResponse"
  },
  "GetCardDepositsReport": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#GetCardDepositsReport",
    "partName": "Request",
    "requestType": "ns2:TGetCardDepositsReportRequest",
    "responsePart": "return",
    "responseType": "ns2:TGetCardDepositsReportResponse"
  },
  "SendMessage": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#SendMessage",
    "partName": "Request",
    "requestType": "ns2:TSendMessageRequest",
    "responsePart": "return",
    "responseType": "ns2:TSendMessageResponse"
  },
  "UpdateD3Time": {
    "soapAction": "urn:TPAPIPosIntfU-ITPAPIPOS#UpdateD3Time",
    "partName": "Request",
    "requestType": "ns2:TD3TimeRequest",
    "responsePart": "return",
    "responseType": "ns2:TD3TimeResponse"
  }
};

export class TpapiError extends Error {
  constructor(message: string, readonly context: Record<string, unknown> = {}) {
    super(message);
    this.name = new.target.name;
  }
}

/** Network level: timeout, DNS, refused, non-SOAP HTTP error. */
export class TpapiTransportError extends TpapiError {}

/** The server answered with a SOAP Fault. */
export class TpapiFaultError extends TpapiError {
  constructor(readonly faultCode: string, readonly faultString: string, context: Record<string, unknown> = {}) {
    super(`SOAP Fault ${faultCode}: ${faultString}`, context);
  }
}

/** The call succeeded but TPAPI reported a non-success ReturnCode. */
export class TpapiReturnCodeError extends TpapiError {
  constructor(readonly returnCode: number, readonly returnMessage: string, context: Record<string, unknown> = {}) {
    super(`TPAPI ReturnCode ${returnCode}: ${returnMessage || "(no message)"}`, context);
  }
}

/** The operation does not exist in the WSDL. */
export class TpapiUnknownOperationError extends TpapiError {
  constructor(operation: string) {
    super(`Operation "${operation}" is not defined in the WSDL`);
  }
}
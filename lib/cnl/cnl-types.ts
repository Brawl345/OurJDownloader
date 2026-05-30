export interface CNLFormData {
  crypted?: string[];
  jk?: string[];
  urls?: string[];
  passwords?: string[];
  package?: string[];
  source?: string[];
}

export interface CNLRequestData {
  url: string;
  formData: CNLFormData;
}

export interface CNLDecryptedData {
  links: string[];
  passwords: string[];
  packageName?: string;
  sourceUrl?: string;
}

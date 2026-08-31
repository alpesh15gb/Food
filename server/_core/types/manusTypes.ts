/** OAuth provider type definitions. */
export type ExchangeTokenRequest = {
  clientId: string;
  grantType: string;
  code: string;
  redirectUri: string;
};

export type ExchangeTokenResponse = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
};

export type GetUserInfoResponse = {
  openId: string;
  name: string;
  email?: string;
  platform?: string;
  loginMethod?: string;
  platforms?: string[];
};

export type GetUserInfoWithJwtRequest = {
  jwtToken: string;
  projectId: string;
};

export type GetUserInfoWithJwtResponse = GetUserInfoResponse & {
  taskUid?: string;
};

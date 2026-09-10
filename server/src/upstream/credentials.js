import { constants, createPublicKey, publicEncrypt } from "node:crypto";

// 联通客户端登录协议的公开 RSA 密钥，协议参考见后端说明。
const LOGIN_PUBLIC_KEY = createPublicKey({
  key: Buffer.from("MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDc+CZK9bBA9IU+gZUOc6FUGu7yO9WpTNB0PzmgFBh96Mg1WrovD1oqZ+eIF4LjvxKXGOdI79JRdve9NPhQo07+uqGQgE4imwNnRx7PFtCRryiIEcUoavuNtuRVoBAm6qdB0SrctgaqGfLgKvZHOnwTjyNqjBUxzMeQlEC2czEMSwIDAQAB", "base64"),
  format: "der",
  type: "spki",
});

export function encryptCredential(value, key = LOGIN_PUBLIC_KEY) {
  return publicEncrypt({ key, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(value)).toString("base64");
}

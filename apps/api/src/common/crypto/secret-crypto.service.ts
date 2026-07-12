import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

@Injectable()
export class SecretCryptoService {
  constructor(private readonly config: ConfigService) {}

  encrypt(plainText: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return ["v1", iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
  }

  decrypt(payload: string) {
    const [version, ivRaw, tagRaw, encryptedRaw] = payload.split(":");
    if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) {
      throw new BadRequestException("Unsupported encrypted secret format");
    }

    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey(), Buffer.from(ivRaw, "base64"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64")),
      decipher.final()
    ]).toString("utf8");
  }

  private encryptionKey() {
    return createHash("sha256")
      .update(
        this.config.get<string>("SECRET_ENCRYPTION_KEY") ??
          this.config.get<string>("JWT_REFRESH_SECRET") ??
          "dev-secret-encryption-key"
      )
      .digest();
  }
}

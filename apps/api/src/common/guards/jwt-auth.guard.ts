import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { LoginMethod } from "@1toufang/database/client";
import { AuthenticatedUser } from "../types/authenticated-request";

type RequestWithAuth = {
  headers: {
    authorization?: string;
  };
  user?: AuthenticatedUser;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }

    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        email: string;
        method: LoginMethod;
        teamId?: string;
        roleId?: string | null;
        employeeNo?: string;
      }>(header.slice("Bearer ".length), {
        secret: this.config.get<string>("JWT_ACCESS_SECRET") ?? "dev-access-secret"
      });

      request.user = {
        id: payload.sub,
        email: payload.email,
        method: payload.method,
        teamId: payload.teamId,
        roleId: payload.roleId,
        employeeNo: payload.employeeNo
      };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid bearer token");
    }
  }
}

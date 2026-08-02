import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { AuthService } from "./auth.service";
import { EmployeeLoginDto, LoginDto, RefreshTokenDto, RegisterDto } from "./dto";

type RequestLike = {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
};

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  register(@Body() dto: RegisterDto, @Req() req: RequestLike) {
    return this.authService.register(dto, this.requestMeta(req));
  }

  @Post("login")
  login(@Body() dto: LoginDto, @Req() req: RequestLike) {
    return this.authService.login(dto, this.requestMeta(req));
  }

  @Post("employee-login")
  employeeLogin(@Body() dto: EmployeeLoginDto, @Req() req: RequestLike) {
    return this.authService.employeeLogin(dto, this.requestMeta(req));
  }

  @Post("refresh")
  refresh(@Body() dto: RefreshTokenDto, @Req() req: RequestLike) {
    return this.authService.refresh(dto.refreshToken, this.requestMeta(req));
  }

  @Post("logout")
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Get("health")
  health() {
    return { ok: true };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user);
  }

  private requestMeta(req: RequestLike) {
    const userAgent = req.headers?.["user-agent"];
    return {
      ipAddress: req.ip,
      userAgent: Array.isArray(userAgent) ? userAgent.join(" ") : userAgent
    };
  }
}

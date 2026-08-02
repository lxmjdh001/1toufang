import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  EmployeeStatus,
  LoginMethod,
  ReviewStatus,
  TeamMemberStatus,
  TeamStatus,
  User,
  UserStatus
} from "@1toufang/database/client";
import * as bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { EmployeeLoginDto, LoginDto, RegisterDto } from "./dto";

type RequestMeta = {
  ipAddress?: string;
  userAgent?: string;
};

type TokenContext = {
  teamId?: string;
  roleId?: string | null;
  employeeNo?: string;
  method: LoginMethod;
};

const MAX_FAILED_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  async register(dto: RegisterDto, meta: RequestMeta) {
    const existing = await this.db.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException("Email already registered");
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.db.user.create({
      data: {
        email: dto.email,
        passwordHash,
        status: UserStatus.PENDING_REVIEW,
        profile: {
          create: {
            name: dto.name,
            companyName: dto.companyName,
            phone: dto.phone
          }
        },
        reviewRequests: {
          create: {
            status: ReviewStatus.PENDING,
            requestedNotes: dto.companyName
          }
        },
        auditLogs: {
          create: {
            action: "USER_REGISTERED",
            entityType: "user",
            metadata: { email: dto.email, ipAddress: meta.ipAddress }
          }
        }
      },
      include: { profile: true }
    });

    return {
      userId: user.id,
      status: "pending_review",
      message: "Registration submitted. Please wait for administrator approval."
    };
  }

  async login(dto: LoginDto, meta: RequestMeta) {
    const user = await this.db.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      await this.logLogin(null, LoginMethod.EMAIL, false, "USER_NOT_FOUND", meta);
      throw new UnauthorizedException("Invalid email or password");
    }

    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      await this.handleFailedLogin(user, LoginMethod.EMAIL, meta);
      throw new UnauthorizedException("Invalid email or password");
    }

    this.assertUserCanLogin(user);
    const membership = await this.resolveActiveMembership(user.id);

    await this.db.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date()
      }
    });
    await this.logLogin(user.id, LoginMethod.EMAIL, true, null, meta);

    return this.issueTokens(user, { method: LoginMethod.EMAIL, teamId: membership.teamId, roleId: membership.roleId }, meta);
  }

  async employeeLogin(dto: EmployeeLoginDto, meta: RequestMeta) {
    const employee = await this.db.employeeAccount.findUnique({
      where: { employeeNo: dto.employeeNo },
      include: { user: true, team: true }
    });

    if (!employee) {
      await this.logLogin(null, LoginMethod.EMPLOYEE_NO, false, "EMPLOYEE_NOT_FOUND", meta, dto.employeeNo);
      throw new UnauthorizedException("Invalid employee number or password");
    }

    if (employee.status !== EmployeeStatus.ACTIVE) {
      await this.logLogin(employee.userId, LoginMethod.EMPLOYEE_NO, false, "EMPLOYEE_DISABLED", meta, dto.employeeNo);
      throw new ForbiddenException("Employee account is disabled");
    }

    this.assertTeamCanLogin(employee.team);

    const passwordOk = await bcrypt.compare(dto.password, employee.user.passwordHash);
    if (!passwordOk) {
      await this.handleFailedLogin(employee.user, LoginMethod.EMPLOYEE_NO, meta, dto.employeeNo);
      throw new UnauthorizedException("Invalid employee number or password");
    }

    this.assertUserCanLogin(employee.user);

    await this.db.user.update({
      where: { id: employee.userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date()
      }
    });
    await this.logLogin(employee.userId, LoginMethod.EMPLOYEE_NO, true, null, meta, dto.employeeNo);

    return this.issueTokens(
      employee.user,
      {
        method: LoginMethod.EMPLOYEE_NO,
        teamId: employee.teamId,
        roleId: employee.roleId,
        employeeNo: employee.employeeNo
      },
      meta
    );
  }

  async refresh(refreshToken: string, meta: RequestMeta) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const sessions = await this.db.session.findMany({
      where: {
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      }
    });

    for (const session of sessions) {
      const matches = await bcrypt.compare(refreshToken, session.refreshTokenHash);
      if (!matches) continue;

      const user = await this.db.user.findUniqueOrThrow({ where: { id: payload.sub } });
      this.assertUserCanLogin(user);
      const context = await this.resolveTokenContext(user.id, {
        method: payload.method,
        teamId: payload.teamId,
        roleId: payload.roleId,
        employeeNo: payload.employeeNo
      });
      await this.db.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() }
      });
      return this.issueTokens(user, context, meta);
    }

    throw new UnauthorizedException("Invalid refresh token");
  }

  async logout(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const sessions = await this.db.session.findMany({
      where: {
        userId: payload.sub,
        revokedAt: null
      }
    });

    for (const session of sessions) {
      const matches = await bcrypt.compare(refreshToken, session.refreshTokenHash);
      if (matches) {
        await this.db.session.update({
          where: { id: session.id },
          data: { revokedAt: new Date() }
        });
      }
    }

    return { ok: true };
  }

  async me(authenticatedUser: AuthenticatedUser) {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: authenticatedUser.id },
      include: {
        profile: true,
        employeeAccounts: { include: { team: true, role: true } },
        teamMemberships: {
          include: {
            team: true,
            role: {
              include: {
                permissions: { include: { permission: true } }
              }
            },
            permissions: { include: { permission: true } }
          }
        }
      }
    });
    this.assertUserCanLogin(user);
    await this.resolveTokenContext(user.id, {
      method: authenticatedUser.method,
      teamId: authenticatedUser.teamId,
      roleId: authenticatedUser.roleId,
      employeeNo: authenticatedUser.employeeNo
    });
    return user;
  }

  private assertUserCanLogin(user: User) {
    if (user.status !== UserStatus.ACTIVE) {
      const code = user.status.toLowerCase();
      throw new ForbiddenException({
        code,
        message: this.statusMessage(user.status)
      });
    }

    if (user.accessExpiresAt && user.accessExpiresAt <= new Date()) {
      throw new ForbiddenException({
        code: "access_expired",
        message: "账号开通已到期，请联系管理员续期"
      });
    }
  }

  private assertTeamCanLogin(team: { status: TeamStatus; expiresAt: Date | null }) {
    if (team.status !== TeamStatus.ACTIVE) {
      throw new ForbiddenException({
        code: "team_inactive",
        message: "团队未启用，请联系管理员"
      });
    }

    if (team.expiresAt && team.expiresAt <= new Date()) {
      throw new ForbiddenException({
        code: "team_expired",
        message: "团队开通已到期，请联系管理员续期"
      });
    }
  }

  private async resolveTokenContext(userId: string, context: TokenContext): Promise<TokenContext> {
    if (context.method === LoginMethod.EMPLOYEE_NO && context.employeeNo) {
      const employee = await this.db.employeeAccount.findUnique({
        where: { employeeNo: context.employeeNo },
        include: { team: true }
      });
      if (!employee || employee.userId !== userId || employee.status !== EmployeeStatus.ACTIVE) {
        throw new ForbiddenException("Employee account is disabled");
      }
      this.assertTeamCanLogin(employee.team);
      return {
        ...context,
        teamId: employee.teamId,
        roleId: employee.roleId
      };
    }

    const membership = await this.resolveActiveMembership(userId, context.teamId);
    return {
      method: LoginMethod.EMAIL,
      teamId: membership.teamId,
      roleId: membership.roleId
    };
  }

  private async resolveActiveMembership(userId: string, teamId?: string) {
    const membership = await this.db.teamMember.findFirst({
      where: {
        userId,
        status: TeamMemberStatus.ACTIVE,
        ...(teamId ? { teamId } : {}),
        team: {
          status: TeamStatus.ACTIVE,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
        }
      },
      include: { team: true },
      orderBy: { createdAt: "asc" }
    });

    if (!membership) {
      throw new ForbiddenException({
        code: "team_unavailable",
        message: "没有可用团队，请联系管理员开通或续期"
      });
    }

    return membership;
  }

  private statusMessage(status: UserStatus) {
    const messages: Record<UserStatus, string> = {
      [UserStatus.PENDING_REVIEW]: "Account is pending administrator approval",
      [UserStatus.ACTIVE]: "Account is active",
      [UserStatus.REJECTED]: "Registration was rejected",
      [UserStatus.SUSPENDED]: "Account is suspended",
      [UserStatus.DISABLED]: "Account is disabled",
      [UserStatus.LOCKED]: "Account is locked"
    };
    return messages[status];
  }

  private async handleFailedLogin(user: User, method: LoginMethod, meta: RequestMeta, employeeNo?: string) {
    const attempts = user.failedLoginAttempts + 1;
    const locked = attempts >= MAX_FAILED_ATTEMPTS;

    await this.db.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        ...(locked
          ? {
              status: UserStatus.LOCKED,
              lockedUntil: new Date(Date.now() + 30 * 60 * 1000)
            }
          : {})
      }
    });

    await this.logLogin(user.id, method, false, locked ? "ACCOUNT_LOCKED" : "BAD_PASSWORD", meta, employeeNo);
  }

  private async issueTokens(user: User, context: TokenContext, meta: RequestMeta) {
    const payload = {
      sub: user.id,
      email: user.email,
      method: context.method,
      teamId: context.teamId,
      roleId: context.roleId,
      employeeNo: context.employeeNo
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>("JWT_ACCESS_SECRET") ?? "dev-access-secret",
      expiresIn: "15m"
    });
    const refreshToken = await this.jwt.signAsync(
      { ...payload, nonce: randomUUID() },
      {
        secret: this.config.get<string>("JWT_REFRESH_SECRET") ?? "dev-refresh-secret",
        expiresIn: "30d"
      }
    );

    await this.db.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: await bcrypt.hash(refreshToken, 12),
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        status: user.status,
        teamId: context.teamId,
        roleId: context.roleId,
        employeeNo: context.employeeNo
      }
    };
  }

  private async verifyRefreshToken(refreshToken: string) {
    try {
      return await this.jwt.verifyAsync<{
        sub: string;
        method: LoginMethod;
        teamId?: string;
        roleId?: string | null;
        employeeNo?: string;
      }>(refreshToken, {
        secret: this.config.get<string>("JWT_REFRESH_SECRET") ?? "dev-refresh-secret"
      });
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }
  }

  private logLogin(
    userId: string | null,
    method: LoginMethod,
    success: boolean,
    failureReason: string | null,
    meta: RequestMeta,
    employeeNo?: string
  ) {
    return this.db.loginLog.create({
      data: {
        userId,
        method,
        success,
        failureReason,
        employeeNo,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent
      }
    });
  }
}

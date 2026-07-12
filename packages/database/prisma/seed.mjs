import bcrypt from "bcryptjs";
import {
  EmployeeStatus,
  PrismaClient,
  ReviewStatus,
  TeamMemberStatus,
  UserStatus
} from "../generated/client/index.js";

const prisma = new PrismaClient();

const permissionCodes = [
  ["users.review", "审核用户"],
  ["users.manage", "管理用户"],
  ["employees.manage", "管理员工号"],
  ["roles.manage", "管理角色权限"],
  ["ad_accounts.view", "查看广告账户"],
  ["ad_accounts.manage", "管理广告账户"],
  ["campaigns.create", "创建 Campaign"],
  ["campaigns.publish", "发布 Campaign"],
  ["campaigns.budget.update", "修改预算"],
  ["campaigns.status.update", "暂停/启动广告"],
  ["campaigns.delete", "删除广告"],
  ["media.manage", "管理素材"],
  ["copywriting.manage", "管理文案"],
  ["targeting.manage", "管理受众"],
  ["strategies.manage", "管理策略模板"],
  ["automation.manage", "管理自动化规则"],
  ["pixels.manage", "管理 Pixel"],
  ["finance.view", "查看财务"],
  ["finance.manage", "充值/账务操作"],
  ["reports.view", "查看报表"],
  ["reports.export", "导出数据"],
  ["system.config.manage", "管理系统配置"],
  ["audit_logs.view", "查看操作日志"]
];

async function main() {
  for (const [code, name] of permissionCodes) {
    await prisma.permission.upsert({
      where: { code },
      create: { code, name },
      update: { name }
    });
  }

  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@wzzads.local";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "Admin123456!";
  const employeeNo = process.env.SEED_ADMIN_EMPLOYEE_NO ?? "TF000001";
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      status: UserStatus.ACTIVE,
      profile: {
        create: {
          name: "Super Admin",
          companyName: "WzzAds"
        }
      },
      reviewRequests: {
        create: {
          status: ReviewStatus.APPROVED,
          reviewNotes: "Seeded super admin",
          reviewedAt: new Date()
        }
      }
    },
    update: {
      passwordHash,
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
      lockedUntil: null
    }
  });

  const team = await prisma.team.upsert({
    where: { id: "seed-team" },
    create: {
      id: "seed-team",
      name: "WzzAds Admin",
      ownerId: user.id
    },
    update: {
      name: "WzzAds Admin",
      ownerId: user.id
    }
  });

  const role = await prisma.role.upsert({
    where: { teamId_name: { teamId: team.id, name: "Super Admin" } },
    create: {
      teamId: team.id,
      name: "Super Admin",
      description: "平台最高权限",
      isSystem: true
    },
    update: {
      description: "平台最高权限",
      isSystem: true
    }
  });

  const permissions = await prisma.permission.findMany();
  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId: permission.id
        }
      },
      create: {
        roleId: role.id,
        permissionId: permission.id
      },
      update: {}
    });
  }

  await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId: team.id, userId: user.id } },
    create: {
      teamId: team.id,
      userId: user.id,
      roleId: role.id,
      status: TeamMemberStatus.ACTIVE
    },
    update: {
      roleId: role.id,
      status: TeamMemberStatus.ACTIVE
    }
  });

  await prisma.employeeAccount.upsert({
    where: { employeeNo },
    create: {
      employeeNo,
      userId: user.id,
      teamId: team.id,
      roleId: role.id,
      status: EmployeeStatus.ACTIVE
    },
    update: {
      userId: user.id,
      teamId: team.id,
      roleId: role.id,
      status: EmployeeStatus.ACTIVE
    }
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      teamId: team.id,
      action: "SEED_SUPER_ADMIN",
      entityType: "user",
      entityId: user.id,
      metadata: { email, employeeNo }
    }
  });

  console.log(`Seeded admin: ${email} / ${password}`);
  console.log(`Seeded employee no: ${employeeNo} / ${password}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

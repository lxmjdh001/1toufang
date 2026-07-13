import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma, TeamMemberStatus } from "@1toufang/database/client";
import { randomUUID } from "crypto";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DatabaseService } from "../database/database.service";
import { AnalyticsQueryDto, TrackConversionDto, TrackVisitDto } from "./dto";

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
};

type DateRange = {
  start: Date;
  end: Date;
  days: string[];
};

@Injectable()
export class AnalyticsService {
  constructor(private readonly db: DatabaseService) {}

  async trackVisit(dto: TrackVisitDto, request: RequestLike) {
    const teamId = await this.resolveTrackingTeam(dto);
    const requestId = clean(dto.requestId) ?? randomUUID();
    const row = await this.db.visitorLog.create({
      data: {
        teamId,
        requestId,
        campaignId: clean(dto.campaignId),
        adSetId: clean(dto.adSetId),
        adId: clean(dto.adId),
        landingPageId: clean(dto.landingPageId),
        offerId: clean(dto.offerId),
        pwaAppId: clean(dto.pwaAppId),
        domainId: clean(dto.domainId),
        project: clean(dto.project),
        ip: ipFromRequest(request),
        country: clean(dto.country),
        region: clean(dto.region),
        city: clean(dto.city),
        client: clean(dto.client) ?? clientFromUserAgent(headerValue(request, "user-agent")),
        device: clean(dto.device),
        browser: clean(dto.browser),
        os: clean(dto.os),
        referrer: clean(dto.referrer) ?? headerValue(request, "referer") ?? headerValue(request, "referrer"),
        userAgent: headerValue(request, "user-agent"),
        event1: dto.event1 ?? 0,
        event2: dto.event2 ?? 0,
        event3: dto.event3 ?? 0,
        clickCost: numberValue(dto.clickCost),
        conversionRate: numberValue(dto.conversionRate),
        feedback: clean(dto.feedback),
        metadata: dto.metadata ? toJson(dto.metadata) : undefined
      }
    });
    return { ok: true, id: row.id, requestId: row.requestId, visitAt: row.visitAt };
  }

  async trackConversion(dto: TrackConversionDto, request: RequestLike) {
    const visitor = await this.resolveVisitor(dto);
    const teamId = visitor?.teamId ?? (await this.resolveTrackingTeam(dto));
    const row = await this.db.conversionEvent.create({
      data: {
        teamId,
        visitorLogId: visitor?.id ?? clean(dto.visitorLogId),
        requestId: clean(dto.requestId) ?? visitor?.requestId,
        campaignId: clean(dto.campaignId) ?? visitor?.campaignId,
        adSetId: clean(dto.adSetId) ?? visitor?.adSetId,
        adId: clean(dto.adId) ?? visitor?.adId,
        landingPageId: clean(dto.landingPageId) ?? visitor?.landingPageId,
        offerId: clean(dto.offerId) ?? visitor?.offerId,
        pwaAppId: clean(dto.pwaAppId) ?? visitor?.pwaAppId,
        domainId: clean(dto.domainId) ?? visitor?.domainId,
        eventName: clean(dto.eventName) ?? "conversion",
        eventValue: numberValue(dto.eventValue),
        currency: clean(dto.currency) ?? "USD",
        status: clean(dto.status) ?? "confirmed",
        feedback: clean(dto.feedback),
        metadata: toJson({
          ...(dto.metadata ?? {}),
          trackedIp: ipFromRequest(request),
          trackedUserAgent: headerValue(request, "user-agent")
        })
      }
    });
    return { ok: true, id: row.id, requestId: row.requestId, convertedAt: row.convertedAt };
  }

  async overview(query: AnalyticsQueryDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const range = resolveDateRange(query.startDate, query.endDate);
    const [visitors, conversions] = await Promise.all([
      this.db.visitorLog.findMany({
        where: {
          teamId,
          visitAt: { gte: range.start, lte: range.end },
          ...filterWhere(query)
        },
        orderBy: { visitAt: "asc" }
      }),
      this.db.conversionEvent.findMany({
        where: {
          teamId,
          convertedAt: { gte: range.start, lte: range.end },
          ...filterWhere(query)
        },
        orderBy: { convertedAt: "asc" }
      })
    ]);
    const visitorSeries = new Map(range.days.map((day) => [day, 0]));
    const conversionSeries = new Map(range.days.map((day) => [day, 0]));
    const landingPageBreakdown = new Map<string, { id: string; visits: number; conversions: number }>();
    const offerBreakdown = new Map<string, { id: string; visits: number; conversions: number }>();

    for (const visitor of visitors) {
      addCount(visitorSeries, dateKey(visitor.visitAt));
      if (visitor.landingPageId) addBreakdown(landingPageBreakdown, visitor.landingPageId, "visits");
      if (visitor.offerId) addBreakdown(offerBreakdown, visitor.offerId, "visits");
    }
    for (const conversion of conversions) {
      addCount(conversionSeries, dateKey(conversion.convertedAt));
      if (conversion.landingPageId) addBreakdown(landingPageBreakdown, conversion.landingPageId, "conversions");
      if (conversion.offerId) addBreakdown(offerBreakdown, conversion.offerId, "conversions");
    }

    return {
      range: { startDate: dateKey(range.start), endDate: dateKey(range.end) },
      totals: {
        visitors: visitors.length,
        conversions: conversions.length,
        conversionRate: visitors.length ? round((conversions.length / visitors.length) * 100, 2) : 0
      },
      series: range.days.map((date) => ({
        date,
        visitors: visitorSeries.get(date) ?? 0,
        conversions: conversionSeries.get(date) ?? 0
      })),
      landingPages: Array.from(landingPageBreakdown.values()).sort((left, right) => right.visits - left.visits).slice(0, 8),
      offers: Array.from(offerBreakdown.values()).sort((left, right) => right.visits - left.visits).slice(0, 8)
    };
  }

  async visitors(query: AnalyticsQueryDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const range = resolveDateRange(query.startDate, query.endDate);
    const keyword = clean(query.search)?.toLowerCase();
    const rows = await this.db.visitorLog.findMany({
      where: {
        teamId,
        visitAt: { gte: range.start, lte: range.end },
        ...filterWhere(query),
        ...(keyword
          ? {
              OR: [
                { requestId: { contains: keyword, mode: Prisma.QueryMode.insensitive } },
                { project: { contains: keyword, mode: Prisma.QueryMode.insensitive } },
                { ip: { contains: keyword, mode: Prisma.QueryMode.insensitive } },
                { client: { contains: keyword, mode: Prisma.QueryMode.insensitive } },
                { referrer: { contains: keyword, mode: Prisma.QueryMode.insensitive } },
                { feedback: { contains: keyword, mode: Prisma.QueryMode.insensitive } }
              ]
            }
          : {})
      },
      include: { conversions: true },
      orderBy: { visitAt: "desc" },
      take: 500
    });
    return rows.map((row) => ({
      ...row,
      conversionsCount: row.conversions.length,
      conversionRate: row.conversions.length ? 100 : row.conversionRate
    }));
  }

  async conversions(query: AnalyticsQueryDto, user: AuthenticatedUser) {
    const teamId = await this.resolveTeamId(user);
    const range = resolveDateRange(query.startDate, query.endDate);
    const keyword = clean(query.search)?.toLowerCase();
    return this.db.conversionEvent.findMany({
      where: {
        teamId,
        convertedAt: { gte: range.start, lte: range.end },
        ...filterWhere(query),
        ...(keyword
          ? {
              OR: [
                { requestId: { contains: keyword, mode: Prisma.QueryMode.insensitive } },
                { eventName: { contains: keyword, mode: Prisma.QueryMode.insensitive } },
                { status: { contains: keyword, mode: Prisma.QueryMode.insensitive } },
                { feedback: { contains: keyword, mode: Prisma.QueryMode.insensitive } }
              ]
            }
          : {})
      },
      include: { visitorLog: true },
      orderBy: { convertedAt: "desc" },
      take: 500
    });
  }

  private async resolveTrackingTeam(dto: TrackVisitDto | TrackConversionDto) {
    if (clean(dto.teamId)) return clean(dto.teamId) as string;
    if (clean(dto.campaignId)) {
      const campaign = await this.db.campaign.findFirst({ where: { id: dto.campaignId }, select: { teamId: true } });
      if (campaign) return campaign.teamId;
    }
    if (clean(dto.landingPageId)) {
      const row = await this.db.landingPage.findFirst({ where: { id: dto.landingPageId }, select: { teamId: true } });
      if (row) return row.teamId;
    }
    if (clean(dto.offerId)) {
      const row = await this.db.offer.findFirst({ where: { id: dto.offerId }, select: { teamId: true } });
      if (row) return row.teamId;
    }
    if (clean(dto.pwaAppId)) {
      const row = await this.db.pwaApp.findFirst({ where: { id: dto.pwaAppId }, select: { teamId: true } });
      if (row) return row.teamId;
    }
    if (clean(dto.domainId)) {
      const row = await this.db.domain.findFirst({ where: { id: dto.domainId }, select: { teamId: true } });
      if (row) return row.teamId;
    }
    throw new BadRequestException("Tracking payload must include teamId or a known campaign/landing page/offer/PWA/domain id");
  }

  private async resolveVisitor(dto: TrackConversionDto) {
    if (clean(dto.visitorLogId)) {
      const visitor = await this.db.visitorLog.findFirst({ where: { id: dto.visitorLogId } });
      if (visitor) return visitor;
    }
    if (clean(dto.requestId)) {
      return this.db.visitorLog.findFirst({ where: { requestId: dto.requestId }, orderBy: { visitAt: "desc" } });
    }
    return null;
  }

  private async resolveTeamId(user: AuthenticatedUser) {
    if (user.teamId) return user.teamId;
    const membership = await this.db.teamMember.findFirst({
      where: { userId: user.id, status: TeamMemberStatus.ACTIVE },
      orderBy: { createdAt: "asc" }
    });
    if (!membership) throw new BadRequestException("User does not belong to a team");
    return membership.teamId;
  }
}

function toJson(value: Record<string, unknown>) {
  return value as Prisma.InputJsonValue;
}

function clean(value?: string | null) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function numberValue(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function headerValue(request: RequestLike, name: string) {
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function ipFromRequest(request: RequestLike) {
  const forwarded = headerValue(request, "x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? request.ip ?? request.socket?.remoteAddress;
}

function clientFromUserAgent(userAgent?: string) {
  if (!userAgent) return undefined;
  if (/mobile|android|iphone|ipad/i.test(userAgent)) return "mobile";
  return "desktop";
}

function resolveDateRange(startDate?: string, endDate?: string): DateRange {
  const end = endDate ? new Date(`${endDate}T23:59:59`) : new Date();
  const start = startDate ? new Date(`${startDate}T00:00:00`) : new Date(end);
  if (!startDate) start.setDate(start.getDate() - 13);
  const days: string[] = [];
  const current = new Date(start);
  current.setHours(0, 0, 0, 0);
  while (current <= end) {
    days.push(dateKey(current));
    current.setDate(current.getDate() + 1);
  }
  return { start, end, days };
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function filterWhere(query: AnalyticsQueryDto) {
  return {
    ...(clean(query.campaignId) ? { campaignId: query.campaignId } : {}),
    ...(clean(query.landingPageId) ? { landingPageId: query.landingPageId } : {}),
    ...(clean(query.offerId) ? { offerId: query.offerId } : {})
  };
}

function addCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function addBreakdown(map: Map<string, { id: string; visits: number; conversions: number }>, id: string, key: "visits" | "conversions") {
  const current = map.get(id) ?? { id, visits: 0, conversions: 0 };
  current[key] += 1;
  map.set(id, current);
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

import Foundation
import Testing

@testable import ModelRouterTray

@Suite("Daily usage source fallback")
struct DailyUsageFallbackTests {
  @Test("router telemetry fills only dates absent from the account stream")
  func accountBucketsRemainAuthoritative() {
    let merged = mergeAccountUsageBuckets(
      account: [
        CodexDailyUsageBucket(startDate: "2026-08-26", tokens: 260),
        CodexDailyUsageBucket(startDate: "2026-08-28", tokens: 280),
      ],
      router: [
        ProviderDailyUsageBucket(startDate: "2026-08-27", tokens: 27_000, requests: 3),
        ProviderDailyUsageBucket(startDate: "2026-08-28", tokens: 99_999, requests: 4),
      ]
    )

    #expect(merged == [
      DailyUsageDisplayBucket(startDate: "2026-08-26", tokens: 260, isRouterFallback: false),
      DailyUsageDisplayBucket(startDate: "2026-08-27", tokens: 27_000, isRouterFallback: true),
      DailyUsageDisplayBucket(startDate: "2026-08-28", tokens: 280, isRouterFallback: false),
    ])
  }

  @Test("an explicit zero account bucket is not replaced by local traffic")
  func explicitZeroWins() {
    let merged = mergeAccountUsageBuckets(
      account: [CodexDailyUsageBucket(startDate: "2026-08-27", tokens: 0)],
      router: [ProviderDailyUsageBucket(startDate: "2026-08-27", tokens: 27_000, requests: 3)]
    )

    #expect(merged == [
      DailyUsageDisplayBucket(startDate: "2026-08-27", tokens: 0, isRouterFallback: false),
    ])
  }

  @Test("widget projection never publishes local fallback as account usage")
  func widgetProjectionExcludesFallbackTokens() {
    let accountDate = Date(timeIntervalSince1970: 1_777_500_000)
    let fallbackDate = accountDate.addingTimeInterval(86_400)
    let projected = routerWidgetDailyPoints([
      DailyUsagePoint(date: accountDate, tokens: 280, isRouterFallback: false),
      DailyUsagePoint(date: fallbackDate, tokens: 27_000, isRouterFallback: true),
    ])

    #expect(projected == [
      RouterWidgetDailyPoint(date: accountDate, tokens: 280),
      RouterWidgetDailyPoint(date: fallbackDate, tokens: 0),
    ])
  }

  @Test("dailyUsagePoints fills missing days and preserves fallback flags")
  func dailyUsagePointsArePureProjection() {
    let calendar = usageDayCalendar
    let today = calendar.startOfDay(for: Date(timeIntervalSince1970: 1_777_500_000))
    let dayMinus2 = calendar.date(byAdding: .day, value: -2, to: today)!
    let keyToday = dailyUsageDayKeyFormatter.string(from: today)
    let keyMinus2 = dailyUsageDayKeyFormatter.string(from: dayMinus2)
    let points = dailyUsagePoints(
      from: [
        DailyUsageDisplayBucket(startDate: keyMinus2, tokens: 100, isRouterFallback: false),
        DailyUsageDisplayBucket(startDate: keyToday, tokens: 280, isRouterFallback: true),
      ],
      days: 3,
      today: today,
      calendar: calendar
    )

    #expect(points.map(\.tokens) == [100, 0, 280])
    #expect(points.map(\.isRouterFallback) == [false, false, true])
  }

  @Test("sumLocalUsageTotals ignores buckets outside the requested window")
  func localUsageTotalsHonorDayWindow() {
    // Usage days are UTC days, so the window this filters on has to be built in
    // that calendar too; a local window against UTC keys admits or drops a day
    // at the edge, by the machine's offset from UTC.
    let calendar = usageDayCalendar
    let today = calendar.startOfDay(for: Date(timeIntervalSince1970: 1_777_500_000))
    let dayMinus1 = calendar.date(byAdding: .day, value: -1, to: today)!
    let dayMinus8 = calendar.date(byAdding: .day, value: -8, to: today)!
    let totals = sumLocalUsageTotals(
      from: [
        ProviderDailyUsageBucket(
          startDate: dailyUsageDayKeyFormatter.string(from: dayMinus8),
          tokens: 9_999,
          requests: 9
        ),
        ProviderDailyUsageBucket(
          startDate: dailyUsageDayKeyFormatter.string(from: dayMinus1),
          tokens: 100,
          requests: 2
        ),
        ProviderDailyUsageBucket(
          startDate: dailyUsageDayKeyFormatter.string(from: today),
          tokens: 50,
          requests: 1
        ),
      ],
      days: 2,
      today: today,
      calendar: calendar
    )

    #expect(totals.tokens == 150)
    #expect(totals.requests == 3)
  }
}

@Suite("Usage day space")
struct UsageDaySpaceTests {
  @Test("account buckets are read in the UTC day space they are written in")
  func accountBucketsUseUTCDays() {
    #expect(dailyUsageDayKeyFormatter.timeZone.secondsFromGMT() == 0)
    #expect(usageDayCalendar.timeZone.secondsFromGMT() == 0)
    // 2026-09-06T18:00Z is already 2026-09-07 for anyone at +07:00 or further
    // east. The account stream's newest bucket is still 2026-09-06, so a local
    // day walk asked for "2026-09-07", found nothing, and drew the account's
    // busiest hours as a confident zero -- every morning, until the offset
    // elapsed.
    let now = Date(timeIntervalSince1970: 1_788_724_800)
    #expect(dailyUsageDayKeyFormatter.string(from: now) == "2026-09-06")

    let points = dailyUsagePoints(
      from: [
        DailyUsageDisplayBucket(startDate: "2026-09-05", tokens: 515_184_784, isRouterFallback: false),
        DailyUsageDisplayBucket(startDate: "2026-09-06", tokens: 422_897_472, isRouterFallback: false),
      ],
      days: 3,
      today: usageDayCalendar.startOfDay(for: now),
      calendar: usageDayCalendar
    )

    #expect(points.count == 3)
    #expect(points.map(\.tokens) == [0, 515_184_784, 422_897_472])
    // The newest point is today's UTC day, and it carries today's number.
    #expect(dailyUsageDayKeyFormatter.string(from: points[2].date) == "2026-09-06")
  }

  @Test("a usage day is labelled with the day its number is from")
  func labelsNameTheMeasuredDay() {
    // The start of UTC 2026-09-06. Formatted in a zone west of UTC this instant
    // falls on the 5th, so a device-zone label would name the wrong day.
    let dayStart = Date(timeIntervalSince1970: 1_788_652_800)
    #expect(dayStart.usageDayLabel(.dateTime.month(.defaultDigits).day()) == "9/6")
  }
}

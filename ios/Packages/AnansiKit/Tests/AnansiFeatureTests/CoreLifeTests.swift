import Foundation
@testable import AnansiFeature
import Testing

/// The Life tab's rules, with the cases of anansi/src/lib/life.test.ts, and the goals board's contract.
struct CoreLifeTests {
    static func day(_ string: String) -> LocalDay { LocalDay(string: string) ?? LocalDay(year: 1970, month: 1, day: 1) }

    static let birth = day("1999-05-03") // a Monday

    @Test func rowsStartAtEachBirthdayAndHoldEveryWeekOnce() {
        let rows = LifeRules.rows(birth: Self.birth, years: 80)
        #expect(rows.count == 80)
        #expect(rows[0].weeks.first == Self.day("1999-05-02"))
        #expect(rows.allSatisfy { $0.weeks.count == 52 || $0.weeks.count == 53 })
        for i in 1..<rows.count {
            #expect(rows[i - 1].weeks.last!.adding(weeks: 1) == rows[i].weeks.first!)
        }
        let all = rows.flatMap(\.weeks)
        #expect(Set(all).count == all.count)
    }

    @Test func agesAndLeapBirthdays() {
        #expect(LifeRules.age(birth: Self.birth, on: Self.day("2026-05-02")) == 26)
        #expect(LifeRules.age(birth: Self.birth, on: Self.day("2026-05-03")) == 27)
        #expect(LifeRules.addYears(Self.day("2000-02-29"), 1) == Self.day("2001-02-28"))
        #expect(LifeRules.lastDay(birth: Self.birth, years: 80) == Self.day("2079-05-02"))
    }

    @Test func openEndsAreTheBirthAndTheEnd() {
        let chapter = LifeChapter(id: "a", title: "Life", color: "#c2673f")
        let range = LifeRules.range(chapter, birth: Self.birth, years: 80)
        #expect(range == Self.birth...Self.day("2079-05-02"))
        #expect(LifeRules.tense(range!, today: Self.day("2026-11-26")) == .now)
        #expect(LifeRules.tense(Self.day("2005-01-01")...Self.day("2011-12-31"), today: Self.day("2026-11-26")) == .past)
        #expect(LifeRules.tense(Self.day("2030-01-01")...Self.day("2035-12-31"), today: Self.day("2026-11-26")) == .future)
    }

    @Test func theShortestChapterWinsAWeek() {
        let life = LifeChapter(id: "life", title: "Life", color: "#c2673f")
        let sf = LifeChapter(id: "sf", title: "SF", color: "#56689e", startDay: "2027-01-01", endDay: "2031-12-31")
        let map = LifeRules.weekChapters([life, sf], birth: Self.birth, years: 80)
        #expect(map[Self.day("2028-06-15").weekStart] == ["sf", "life"])
        #expect(map[Self.day("2026-06-15").weekStart] == ["life"])
    }

    @Test func lengthsAndSpans() {
        #expect(LifeRules.length(Self.day("2005-01-01")...Self.day("2011-12-31")).years == 7)
        #expect(LifeRules.length(Self.day("2026-03-01")...Self.day("2026-08-31")).months == 6)
        let school = LifeChapter(id: "s", title: "School", color: "#c2673f", startDay: "2005-01-01", endDay: "2011-12-31")
        #expect(LifeRules.spanText(school) == "2005 → 2011")
        let open = LifeChapter(id: "o", title: "Here", color: "#c2673f")
        #expect(LifeRules.spanText(open) == "Birth → the end")
    }

    @Test func colours() {
        #expect(LifeRules.nextColor(used: []) == LifeRules.colors[0])
        #expect(LifeRules.nextColor(used: [LifeRules.colors[0].uppercased()]) == LifeRules.colors[1])
        let rgb = LifeRules.rgb("#ff8000")
        #expect(rgb?.red == 1 && rgb?.blue == 0)
        #expect(LifeRules.rgb("nope") == nil)
    }

    @Test func decodesTheLife() throws {
        let json = """
        {"birthDate":"1999-05-03","lifeExpectancyYears":80,
         "chapters":[{"id":"c1","title":"School","emoji":null,"color":"#c2673f","notes":null,"startDay":"2005-03-01",
                      "endDay":null,"goalIds":["g1"],"createdAt":"2026-11-26T00:00:00.000Z"}],
         "views":[{"id":"v1","name":"Education","emoji":null,"orderIdx":0,"chapterIds":["c1"]}],
         "weeks":{"2026-11-22":{"sync":2,"journal":3,"pictures":1}}}
        """
        let life = try API.decode(LifeData.self, from: Data(json.utf8))
        #expect(life.birth == Self.birth)
        #expect(life.chapters.first?.end == nil)
        #expect(life.chapters.first?.start == Self.day("2005-03-01"))
        #expect(life.record(Self.day("2026-11-22"))?.amount == 5)
    }

    @Test func buildsTheLifeRequests() throws {
        #expect(API.life().path == "api/v1/life")
        #expect(API.lifeWeek(day: Self.day("2026-11-22")).path == "api/v1/life/weeks/2026-11-22")
        let fields = API.ChapterFields(title: "SF", emoji: " ", color: "#56689e", notes: nil, startDay: Self.day("2027-09-01"),
                                       endDay: nil, goalIds: ["g1"], viewIds: [])
        let endpoint = API.createChapter(fields)
        #expect(endpoint.method == "POST")
        let body = try JSONSerialization.jsonObject(with: endpoint.body ?? Data()) as? [String: Any]
        #expect(body?["startDay"] as? String == "2027-09-01")
        #expect(body?["endDay"] is NSNull)
        #expect(body?["emoji"] is NSNull)
        #expect(API.updateChapter("c1", fields).method == "PATCH")
        #expect(API.deleteChapter("c1").path == "api/v1/life/chapters/c1")
        let settings = try JSONSerialization.jsonObject(with: API.setLife(birthDate: Self.birth, lifeExpectancyYears: nil).body ?? Data())
            as? [String: Any]
        #expect(settings?["birthDate"] as? String == "1999-05-03")
        #expect(settings?["lifeExpectancyYears"] == nil)
    }

    @Test func decodesTheGoalsBoard() throws {
        let json = """
        [{"id":"g1","title":"Ship","description":"","emoji":"🚀","parentId":null,"importance":"Low","ownProgress":50,
          "progress":40,"values":[{"id":"v","name":"Craft","color":"#6366f1"}],
          "chapters":[{"id":"c1","title":"SF","emoji":null,"color":"#56689e","startDay":"2027-09-01","endDay":null}],
          "tasks":[{"id":"t1","title":"Call @[Ana](person:p1)","description":null,"emoji":null,"difficulty":2,
                    "completed":true,"scheduledAt":null},
                   {"id":"t2","title":"Write","description":null,"emoji":null,"difficulty":1,"completed":false,
                    "scheduledAt":"2026-12-01T00:00:00.000Z"}]},
         {"id":"g2","title":"Strong","description":"","emoji":null,"parentId":null,"importance":"High","ownProgress":0,
          "progress":0,"values":[],"chapters":[],"tasks":[]}]
        """
        let goals = try API.decode([GoalCard].self, from: Data(json.utf8))
        #expect(GoalCard.ordered(goals).map(\.id) == ["g2", "g1"])
        #expect(goals[0].openTasks.map(\.id) == ["t2"])
        #expect(goals[0].chapters.first?.chapter.start == Self.day("2027-09-01"))
        #expect(API.setTaskCompleted("t1", completed: false).path == "api/v1/tasks/t1")
    }
}

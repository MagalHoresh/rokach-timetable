import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
import {JSDOM} from "jsdom";

const html = readFileSync(new URL("../site/index.html", import.meta.url), "utf8");
const plain = value => JSON.parse(JSON.stringify(value));
const sourceData = JSON.parse(html.match(/<script id="app-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const key = "rokach-grade-1-settings-v1";
const a2Lessons = [
  [["math"], ["math"], ["hebrew", "music"], ["grade"], ["science"]],
  [["hebrew"], ["sport"], ["math"], ["library"], ["life"]],
  [["math"], ["math"], ["art", "hebrew"], ["hebrew"], ["hebrew"]],
  [["heart"], ["roads"], ["math"], ["life"], ["hebrew"]],
  [["hebrew"], ["art", "hebrew"], ["hebrew"], ["math"], ["math"]],
  [["music"], ["science"], ["science"], ["sport"], []]
];

function app(t, {saved, source = html, url = "https://rokach-timetable.magalhoresh.com"} = {}) {
  const dom = new JSDOM(source, {url, runScripts: "outside-only", pretendToBeVisual: true});
  const {window} = dom;
  const blobs = new Map();
  let nextBlob = 0;
  window.matchMedia = () => ({matches: false, addEventListener() {}});
  window.URL.createObjectURL = blob => {
    const id = `blob:test-${++nextBlob}`;
    blobs.set(id, blob);
    return id;
  };
  window.URL.revokeObjectURL = () => {};
  window.Blob = Blob;
  window.File = File;
  window.HTMLMediaElement.prototype.pause = () => {};
  window.HTMLMediaElement.prototype.load = () => {};
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  window.scrollTo = () => {};
  window.confirm = () => true;
  window.fetch = () => { throw new Error("Unexpected network request in DOM simulation"); };
  window.HTMLAnchorElement.prototype.click = function () {
    window.lastDownload = {name: this.download, blob: blobs.get(this.href)};
  };
  if (saved) window.localStorage.setItem(key, JSON.stringify(saved));
  const run = code => new Script(code).runInContext(dom.getInternalVMContext());
  run(window.document.getElementById("app-script").textContent);
  t.after(() => window.close());
  return {
    window, document: window.document,
    data: run("data"),
    run,
    saved: () => JSON.parse(window.localStorage.getItem(key))
  };
}

function oldSettings(presetId = "a3") {
  const data = structuredClone(sourceData);
  delete data.items["math-accessories"];
  data.subjects.math.items = ["math-notebook", "math-book"];
  data.subjects.sport.items = ["sports-kit"];
  const preset = data[`${presetId}Preset`];
  return {
    version: 1, className: preset.className, periodCount: preset.periodCount,
    lessons: preset.lessons, subjects: data.subjects, items: data.items,
    personalization: data.personalization, pencilChecks: [], onboardingComplete: true,
    a1Revision: data.a1Preset.revision, cloudSpeechConsent: false, nameGreetingConsent: null
  };
}

function selectPreset(application, id) {
  application.run(`replaceSchedule("${id}")`);
}

test("public defaults are blank and the GitHub-only footer is accessible and print-hidden", t => {
  const {document, data} = app(t);
  assert.equal(data.personalization.childName, "");
  assert.deepEqual(plain(data.personalization.extraItems), []);
  assert.deepEqual(plain(data.personalization.afternoonDays), []);
  assert.ok(Object.values(data.personalization.activityItems).every(items => !items.length));
  const footer = document.querySelector("footer");
  const link = footer.querySelector("a");
  assert.equal(link.href, "https://github.com/MagalHoresh/rokach-timetable");
  assert.match(link.getAttribute("aria-label"), /GitHub/);
  assert.equal(link.getAttribute("rel"), "noopener noreferrer");
  assert.ok(link.querySelector('svg[aria-hidden="true"]'));
  assert.ok(footer.classList.contains("no-print"));
  assert.equal(footer.textContent.trim(), "");
  assert.match(html, /\.github-link \{[^}]*width: 44px; height: 44px/);
  assert.match(html, /\.github-link:focus-visible/);
});

test("A2 matches every source-image cell and keeps combined lessons and the Friday empty slot", t => {
  const application = app(t);
  const {data, run} = application;
  assert.equal(data.a2Preset.className, "א׳2");
  assert.equal(data.a2Preset.periodCount, 5);
  assert.deepEqual(plain(data.a2Preset.lessons), a2Lessons);
  assert.equal(data.a2Preset.lessons.length, 6);
  assert.ok(data.a2Preset.lessons.every(day => day.length === 5));
  assert.deepEqual(plain(data.days.map(day => day.id)), ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday"]);
  selectPreset(application, "a2");
  assert.deepEqual(plain(data.days.map(day => day.lessons)), a2Lessons);
  assert.deepEqual(plain(run("materialIds(['hebrew', 'music'])")), ["hebrew-notebook", "hebrew-book", "music-notebook"]);
  assert.deepEqual(plain(run("materialIds(['art', 'hebrew'])")), ["pencilcase", "hebrew-notebook", "hebrew-book"]);
  assert.match(run("lessonCell([])"), /משבצת ריקה/);
  for (const [id, label] of Object.entries({
    math: "חשבון", hebrew: "עברית", music: "מוסיקה", grade: "שעה שכבתית",
    science: "מדעים", sport: "חנוך גופני", library: "ספריה", life: "כשורי חיים",
    art: "אומנות", heart: "מפתח הלב", roads: "זהירות בדרכים"
  })) {
    assert.equal(run(`subjectForClass("${id}").name`).replace(/[\u0591-\u05c7]/g, ""), label);
  }
  for (const time of ["8:00–8:45", "8:45–9:30", "10:10–10:55", "10:55–11:40", "12:00–12:45"]) {
    assert.ok(application.document.getElementById("settings-dialog").textContent.includes(time));
  }
  assert.ok(!html.includes("מערכת א׳2 טרם נמסרה"));
});

test("A1 remains the fresh-install default and presets are offered in A1, A2, A3 order", t => {
  const {data, run, document, saved} = app(t);
  assert.equal(data.className, "א׳1");
  assert.deepEqual(plain(data.days.map(day => day.lessons)), sourceData.a1Preset.lessons);
  assert.equal(saved(), null);
  assert.deepEqual(plain(run("Object.keys(schedulePresets)")), ["a1", "a2", "a3"]);
  assert.deepEqual([...document.querySelector("#welcome-class").options].map(option => option.value), ["a1", "a2", "a3"]);
  assert.equal(document.getElementById("welcome-class").value, "a1");
  assert.deepEqual([...document.querySelectorAll(".settings-presets button")].map(button => button.id), ["load-a1", "load-a2", "load-a3"]);
  assert.equal(document.getElementById("load-a1").getAttribute("aria-pressed"), "true");
  assert.equal(document.getElementById("load-a2").getAttribute("aria-pressed"), "false");
});

for (const skip of [false, true]) {
  test(`A2 onboarding selection persists with ${skip ? "no name" : "a synthetic name"}`, t => {
    const {document, window, data, saved} = app(t);
    document.getElementById("welcome-class").value = "a2";
    document.getElementById("welcome-name").value = "בדיקה";
    if (skip) document.getElementById("skip-welcome").click();
    else document.getElementById("welcome-form").dispatchEvent(new window.Event("submit", {bubbles: true, cancelable: true}));
    assert.equal(data.className, "א׳2");
    assert.deepEqual(plain(data.days.map(day => day.lessons)), a2Lessons);
    assert.equal(data.personalization.childName, skip ? "" : "בדיקה");
    assert.equal(saved().onboardingComplete, true);
    assert.equal(document.getElementById("welcome-dialog").open, false);
    assert.equal(document.getElementById("load-a2").getAttribute("aria-pressed"), "true");
    assert.equal(app(t, {saved: saved()}).data.className, "א׳2");
  });
}

test("settings buttons load every preset and A2 reload preserves personalized equipment and checks", t => {
  const application = app(t);
  const {data, document, run} = application;
  document.getElementById("child-name").value = "בדיקה";
  document.getElementById("personal-extras").value = "פריט אישי";
  document.getElementById("activity-monday").value = "פריט לחוג";
  document.getElementById("edit-math-book").value = "ספר אישי";
  run("pencilChecks.add(2)");
  for (const id of ["a2", "a3", "a1", "a2"]) {
    document.getElementById(`load-${id}`).click();
    assert.equal(data.className, sourceData[`${id}Preset`].className);
    assert.deepEqual(plain(data.days.map(day => day.lessons)), sourceData[`${id}Preset`].lessons);
    for (const other of ["a1", "a2", "a3"]) {
      assert.equal(document.getElementById(`load-${other}`).getAttribute("aria-pressed"), String(other === id));
    }
    assert.equal(data.personalization.childName, "בדיקה");
    assert.deepEqual(plain(data.personalization.extraItems), ["פריט אישי"]);
    assert.deepEqual(plain(data.personalization.activityItems.monday), ["פריט לחוג"]);
    assert.equal(data.items["math-book"].name, "ספר אישי");
  }
  const saved = application.saved();
  assert.deepEqual(saved.pencilChecks, [2]);
  const restored = app(t, {saved});
  assert.equal(restored.data.className, "א׳2");
  assert.deepEqual(plain(restored.data.days.map(day => day.lessons)), a2Lessons);
  assert.deepEqual(restored.saved(), saved);
  assert.equal(restored.document.getElementById("welcome-class").value, "a2");
});

for (const id of ["a1", "a3"]) {
  test(`${id}: existing current-revision saved schedule and customizations are not reset`, t => {
    const saved = oldSettings(id);
    saved.equipmentRevision = "2026-10-13";
    saved.lessons[0][0] = ["roads"];
    saved.personalization.extraItems = ["פריט אישי"];
    saved.items["math-book"].name = "ספר אישי";
    saved.subjects.math.items = ["math-book"];
    const application = app(t, {saved});
    assert.equal(application.data.className, saved.className);
    assert.deepEqual(plain(application.data.days.map(day => day.lessons)), saved.lessons);
    assert.deepEqual(plain(application.data.subjects.math.items), ["math-book"]);
    assert.equal(application.data.items["math-book"].name, "ספר אישי");
    assert.deepEqual(plain(application.data.personalization), saved.personalization);
    assert.deepEqual(application.saved(), saved);
  });
}

test("an existing custom A2 label never triggers replacement, including incomplete onboarding", t => {
  const saved = oldSettings("a1");
  saved.className = "א׳2";
  saved.lessons[0][0] = ["roads"];
  saved.personalization.extraItems = ["פריט אישי"];
  saved.subjects.math.items = ["math-book"];
  saved.equipmentRevision = "2026-10-13";
  saved.onboardingComplete = false;
  const application = app(t, {saved});
  assert.deepEqual(plain(application.data.days.map(day => day.lessons)), saved.lessons);
  assert.deepEqual(application.saved(), saved);
  application.document.getElementById("skip-welcome").click();
  assert.deepEqual(plain(application.data.days.map(day => day.lessons)), saved.lessons);
  assert.deepEqual(plain(application.data.subjects.math.items), ["math-book"]);
  assert.deepEqual(plain(application.data.personalization), saved.personalization);
});

test("A2 schedule recognition warns on relabeling, accepts normalized names and protects custom drafts", t => {
  const application = app(t);
  const {run, data, document, window} = application;
  selectPreset(application, "a2");
  assert.equal(run("scheduleNotice()"), "");
  data.className = "A2";
  assert.equal(run("scheduleNotice()"), "");
  assert.equal(run("subjectForClass('sport').name"), sourceData.subjects.sport.name);
  assert.deepEqual(plain(run("subjectForClass('grade').items")), ["pencilcase"]);
  assert.deepEqual(plain(run("subjectForClass('life').items")), ["pencilcase"]);
  data.className = "א׳3";
  assert.match(run("scheduleNotice()"), /זהים למערכת א׳2/);
  data.periodCount = 6;
  for (const day of data.days) day.lessons.push([]);
  assert.match(run("scheduleNotice()"), /זהים למערכת א׳2/);
  data.className = "א׳2";
  data.days[0].lessons[0] = ["roads"];
  run("renderScheduleEditor()");
  assert.equal(run("scheduleNotice()"), "");
  window.confirm = () => false;
  document.getElementById("load-a2").click();
  assert.deepEqual(plain(data.days[0].lessons[0]), ["roads"]);
  assert.equal(data.periodCount, 6);
  window.confirm = () => true;
  document.getElementById("load-a2").click();
  assert.deepEqual(plain(data.days.map(day => day.lessons)), a2Lessons);
});

for (const preset of ["a1", "a2", "a3"]) {
  test(`${preset}: compact weekly sheet keeps all five periods, covers and equipment in desktop and PDF source`, t => {
    const {run, document, window, data} = app(t);
    selectPreset({run}, preset);
    const sheets = document.querySelectorAll("#sheets .week-sheet");
    assert.equal(sheets.length, 1);
    const sheet = sheets[0];
    assert.equal(sheet.querySelectorAll(".week-table tbody tr").length, 5);
    assert.deepEqual([...sheet.querySelectorAll(".week-table tbody th")].map(th => th.textContent), ["1", "2", "3", "4", "5"]);
    assert.equal(sheet.querySelectorAll(".cover-image").length, 5);
    assert.ok(sheet.textContent.includes(data.items["math-accessories"].name));
    assert.equal(window.getComputedStyle(sheet.querySelector(".week-table td")).paddingTop, "2px");
    assert.equal(window.getComputedStyle(sheet.querySelector(".week-table .material")).fontSize, "12px");
    assert.equal(window.getComputedStyle(sheet.querySelector(".week-table .book-number")).height, "15px");
    assert.equal(window.getComputedStyle(sheet.querySelector(".cover-image")).height, "23mm");
    assert.deepEqual(plain(run('pdfSource("week").pages')), [sheet.outerHTML]);
  });

  test(`${preset}: every math lesson has separate book, notebook and accessories; packing deduplicates`, t => {
    const application = app(t);
    selectPreset(application, preset);
    const {data, run, document} = application;
    let mathDays = 0, nonMathDays = 0;
    for (const day of data.days) {
      const math = day.lessons.flat().includes("math");
      math ? mathDays++ : nonMathDays++;
      const ids = plain(run(`packingIds(data.days.find(day => day.id === "${day.id}"))`));
      assert.equal(ids.filter(id => id === "math-accessories").length, Number(math), day.id);
      if (math) {
        assert.ok(ids.includes("math-book"));
        assert.ok(ids.includes("math-notebook"));
      }
      for (const lesson of day.lessons) {
        if (lesson.includes("math")) {
          const lessonItems = plain(run(`materialIds(${JSON.stringify(lesson)})`));
          assert.ok(lessonItems.includes("math-accessories"), `${day.id} ${lesson}`);
        }
      }
      assert.equal(document.querySelectorAll(`[data-pack-check="${day.id}"][data-item-name="שבילים חדשים - מארז אביזרים"]`).length, Number(math));
    }
    assert.ok(mathDays);
    if (preset === "a1") assert.ok(nonMathDays);
    const geometryOnly = {...plain(data.days[0]), lessons: [["geometry"]]};
    assert.ok(!run(`packingIds(${JSON.stringify(geometryOnly)})`).includes("math-accessories"));
    const withoutMath = {...plain(data.days[0]), lessons: [["hebrew"], ["sport"]]};
    assert.ok(!run(`packingIds(${JSON.stringify(withoutMath)})`).includes("math-accessories"));
  });

  test(`${preset}: shoes follow lesson equipment and precede everyday items; library return stays last`, t => {
    const application = app(t);
    selectPreset(application, preset);
    const {data, run} = application;
    for (const day of data.days) {
      const ids = plain(run(`packingIds(data.days.find(day => day.id === "${day.id}"))`));
      assert.ok(!ids.includes("sports-kit"));
      const required = preset === "a1"
        ? ["sunday", "wednesday", "thursday", "friday"].includes(day.id)
        : day.lessons.flat().includes("sport");
      assert.equal(ids.includes("sports-shoes"), required, day.id);
      if (required) {
        const shoeIndex = ids.indexOf("sports-shoes");
        assert.equal(ids[shoeIndex + 1], "pencilcase");
        for (const id of ids.filter(id => !["sports-shoes", ...plain(data.everyday), "afternoon-container"].includes(id))) {
          assert.ok(ids.indexOf(id) < shoeIndex, id);
        }
      }
      const materials = plain(run(`packingMaterials(data.days.find(day => day.id === "${day.id}"))`));
      if (day.lessons.flat().includes("library")) assert.equal(materials.at(-1).name, data.items["library-book"].name);
    }
  });
}

test("old default A3 settings migrate and persist without losing personal settings or checks", t => {
  const saved = oldSettings();
  saved.personalization.childName = "בדיקה";
  saved.personalization.extraItems = ["פריט בדיקה"];
  saved.personalization.activityItems.monday = ["חוג בדיקה"];
  saved.pencilChecks = [0, 2];
  saved.items["math-book"].name = "ספר אישי";
  saved.items["math-notebook"].color = "#123456";
  saved.items["hebrew-folder"] = {name: "תיקייה", detail: "", icon: "folder"};
  saved.subjects.hebrew.items.push("hebrew-folder");
  const application = app(t, {saved});
  const {data} = application;
  assert.deepEqual(plain(data.subjects.sport.items), ["sports-shoes"]);
  assert.deepEqual(plain(data.subjects.math.items), ["math-notebook", "math-book", "math-accessories"]);
  assert.deepEqual(plain(data.personalization), saved.personalization);
  assert.deepEqual(plain(data.days.map(day => day.lessons)), saved.lessons);
  assert.equal(data.items["math-book"].name, "ספר אישי");
  assert.equal(data.items["math-notebook"].color, "#123456");
  assert.ok(!data.items["hebrew-folder"]);
  assert.ok(!data.subjects.hebrew.items.includes("hebrew-folder"));
  assert.deepEqual(application.saved().pencilChecks, [0, 2]);
  assert.equal(application.saved().equipmentRevision, "2026-10-13");
  const restoredAgain = app(t, {saved: application.saved()});
  assert.equal(restoredAgain.data.subjects.math.items.filter(id => id === "math-accessories").length, 1);
});

for (const edit of [
  {name: "בגדי ספורט אישיים"}, {confirmed: true}, {enabled: false},
  {detail: "הנחיה אישית"}, {cover: "data:image/png;base64,AA=="}
]) {
  test(`A3 preserves deliberately edited sports equipment: ${Object.keys(edit)[0]}`, t => {
    const saved = oldSettings();
    Object.assign(saved.items["sports-kit"], edit);
    const {data} = app(t, {saved});
    assert.deepEqual(plain(data.subjects.sport.items), ["sports-kit"]);
    for (const [key, value] of Object.entries(edit)) assert.equal(data.items["sports-kit"][key], value);
  });
}

test("migrations retain custom subject mappings and disabled accessories across reloads", t => {
  const saved = oldSettings();
  saved.subjects.sport.items = ["pencilcase"];
  saved.subjects.math.items.push("water");
  saved.items["math-accessories"] = {...sourceData.items["math-accessories"], name: "מארז אישי", enabled: false};
  const application = app(t, {saved});
  assert.deepEqual(plain(application.data.subjects.sport.items), ["pencilcase"]);
  assert.deepEqual(plain(application.data.subjects.math.items), ["math-notebook", "math-book", "water", "math-accessories"]);
  assert.equal(application.data.items["math-accessories"].name, "מארז אישי");
  assert.ok(!application.run("materialIds(['math'])").includes("math-accessories"));
  const current = application.saved();
  current.subjects.math.items = ["math-book"];
  assert.deepEqual(plain(app(t, {saved: current}).data.subjects.math.items), ["math-book"]);
});

test("old A1 sports behavior and manually edited timetable are retained", t => {
  const saved = oldSettings("a1");
  saved.lessons[0][0] = ["roads"];
  saved.a1Revision = "older";
  const {data, run} = app(t, {saved});
  assert.deepEqual(plain(data.days[0].lessons[0]), ["roads"]);
  assert.equal(run("pendingA1Update"), true);
  assert.deepEqual(plain(run("subjectForClass('sport').items")), ["sports-shoes"]);
});

test("accessories cover is embedded, valid JPEG and present in lesson, packing and PDF source", t => {
  const application = app(t);
  const {data, run, document} = application;
  const item = data.items["math-accessories"];
  assert.equal(item.name, "שבילים חדשים - מארז אביזרים");
  assert.equal(item.confirmed, true);
  assert.ok(!run("isExample(data.items['math-accessories'])"));
  assert.match(item.cover, /^data:image\/jpeg;base64,/);
  const bytes = Buffer.from(item.cover.split(",")[1], "base64");
  assert.ok(bytes.length > 1000);
  assert.equal(bytes.subarray(0, 3).toString("hex"), "ffd8ff");
  assert.equal(bytes.subarray(-2).toString("hex"), "ffd9");
  assert.match(item.coverSource, /getsefer\.co\.il/);
  assert.ok(run("lessonCell(['math'], true)").includes(item.cover));
  const mathDay = data.days.find(day => day.lessons.flat().includes("math"));
  run(`selectMobileDay("${mathDay.id}")`);
  const instructions = run("readingInstruction(data.items['math-accessories'])");
  assert.match(run(`spokenText(${JSON.stringify(instructions)})`), /מארז האביזרים של שבילים חדשים/);
  assert.ok(!instructions.includes("סֵפֶר"));
  assert.ok(!instructions.includes("בנוסף"));
  assert.equal(document.getElementById("edit-math-accessories").maxLength, 40);
  assert.ok(run("collectBookEdits()").some(edit => edit.id === "math-accessories" && edit.name === item.name));
  for (const scope of ["day", "week", "all-cards"]) {
    const source = run(`pdfSource("${scope}")`);
    assert.ok(source.pages.some(page => page.includes(item.name) && page.includes(item.cover)), scope);
    assert.ok(source.pages.every(page => !page.includes('class="github-link"')));
  }
});

test("personal/class/grade HTML exports re-import with equipment and self-contained cover; clean copies remove personal data and consent", async t => {
  const application = app(t);
  const {run, window, document} = application;
  document.getElementById("child-name").value = "בדיקה";
  document.getElementById("personal-extras").value = "פריט אישי";
  document.getElementById("activity-monday").value = "פריט לחוג";
  for (const mode of ["personal", "class", "grade"]) {
    run(`downloadHTML("${mode}")`);
    const downloaded = await window.lastDownload.blob.text();
    const imported = app(t, {source: downloaded, url: "file:///timetable.html"});
    assert.equal(imported.data.items["math-accessories"].cover, sourceData.items["math-accessories"].cover);
    assert.ok(imported.data.subjects.math.items.includes("math-accessories"));
    assert.equal(imported.data.equipmentRevision, "2026-10-13");
    assert.equal(imported.data.personalization.childName, mode === "personal" ? "בדיקה" : "");
    assert.deepEqual(plain(imported.data.personalization.extraItems), mode === "personal" ? ["פריט אישי"] : []);
    assert.equal(imported.data.cloudSpeechConsent, false);
    assert.equal(imported.data.nameGreetingConsent, null);
    if (mode === "grade") {
      assert.equal(imported.data.className, "");
      assert.ok(imported.data.days.every(day => day.lessons.every(lesson => !lesson.length)));
    }
    assert.equal(imported.document.querySelector(".github-link").href, "https://github.com/MagalHoresh/rokach-timetable");
  }
});

test("A2 personal/class/grade downloads retain all preset selectors and re-import without replacing customized lessons", async t => {
  const application = app(t);
  const {run, window, document} = application;
  document.getElementById("load-a2").click();
  document.getElementById("child-name").value = "בדיקה";
  document.getElementById("personal-extras").value = "פריט אישי";
  document.getElementById("activity-monday").value = "פריט לחוג";
  document.querySelector('[data-lesson-day="sunday"][data-period="0"][data-slot="0"]').value = "roads";
  const customized = structuredClone(a2Lessons);
  customized[0][0] = ["roads"];
  for (const mode of ["personal", "class", "grade"]) {
    run(`downloadHTML("${mode}")`);
    const downloaded = await window.lastDownload.blob.text();
    const imported = app(t, {source: downloaded, url: "file:///timetable.html"});
    assert.deepEqual(plain(imported.run("Object.keys(schedulePresets)")), ["a1", "a2", "a3"]);
    assert.deepEqual(plain(imported.data.a2Preset.lessons), a2Lessons);
    assert.equal(imported.data.className, mode === "grade" ? "" : "א׳2");
    assert.deepEqual(plain(imported.data.days.map(day => day.lessons)), mode === "grade" ? a2Lessons.map(day => day.map(() => [])) : customized);
    assert.equal(imported.data.personalization.childName, mode === "personal" ? "בדיקה" : "");
    assert.deepEqual(plain(imported.data.personalization.extraItems), mode === "personal" ? ["פריט אישי"] : []);
    assert.deepEqual(plain(imported.data.personalization.activityItems.monday), mode === "personal" ? ["פריט לחוג"] : []);
    assert.equal(imported.data.cloudSpeechConsent, false);
    assert.equal(imported.data.nameGreetingConsent, null);
    for (const id of ["a1", "a2", "a3"]) {
      imported.document.getElementById(`load-${id}`).click();
      assert.equal(imported.data.className, sourceData[`${id}Preset`].className);
      assert.deepEqual(plain(imported.data.days.map(day => day.lessons)), sourceData[`${id}Preset`].lessons);
    }
  }
});

test("A2 timetable and PDF sources render every cell and packing/read-aloud use approved daily equipment", t => {
  const application = app(t);
  selectPreset(application, "a2");
  const {run, data, document} = application;
  for (const day of data.days) {
    run(`selectMobileDay("${day.id}")`);
    const rows = document.querySelectorAll("#phone-week .phone-table tbody tr");
    assert.equal(rows.length, 5);
    for (let period = 0; period < 5; period++) {
      const ids = a2Lessons[data.days.indexOf(day)][period];
      const title = rows[period].querySelector(".lesson-title");
      assert.equal(title?.textContent || "", ids.map(id => run(`subjectForClass("${id}").name`)).join(" + "));
    }
    const ids = plain(run(`packingIds(data.days.find(day => day.id === "${day.id}"))`));
    assert.equal(ids.includes("sports-shoes"), ["monday", "friday"].includes(day.id));
    assert.equal(ids.filter(id => id === "math-accessories").length, Number(day.id !== "friday"));
    assert.ok(!ids.includes("sports-kit"));
    for (const id of ids) assert.ok(run(`spokenText(readingInstruction(data.items["${id}"]))`).length > 0);
    const cards = run('pdfSource("day")').pages.join("");
    assert.ok(cards.includes("א׳2"));
    assert.equal(cards.includes(data.items["math-accessories"].name), day.id !== "friday");
    assert.equal(cards.includes(data.items["sports-shoes"].name), ["monday", "friday"].includes(day.id));
  }
  const week = run('pdfSource("week")').pages.join("");
  const pdfDOM = new JSDOM(week);
  t.after(() => pdfDOM.window.close());
  const rendered = pdfDOM.window.document;
  const rows = [...rendered.querySelectorAll(".week-table tbody tr")];
  assert.equal(rows.length, 5);
  for (let period = 0; period < 5; period++) {
    for (let day = 0; day < 6; day++) {
      const cell = rows[period].querySelectorAll("td")[day];
      assert.equal(cell.querySelector(".lesson-title")?.textContent || "", a2Lessons[day][period].map(id => run(`subjectForClass("${id}").name`)).join(" + "));
    }
  }
  assert.ok(rows[4].querySelectorAll("td")[5].classList.contains("empty-cell"));
  assert.ok(!week.includes('class="github-link"'));
  const allCards = run('pdfSource("all-cards")').pages.join("");
  assert.equal((allCards.match(/data-day="/g) || []).length, 6);
  assert.equal((allCards.match(/data-item-name="שבילים חדשים - מארז אביזרים"/g) || []).length, 5);
});

test("changing or disabling the accessories pack persists and removes stale cover on rename", t => {
  const application = app(t);
  application.document.getElementById("edit-math-accessories").value = "מארז אחר";
  application.document.getElementById("enabled-math-accessories").checked = false;
  assert.equal(application.run("applySettings()"), true);
  assert.equal(application.data.items["math-accessories"].name, "מארז אחר");
  assert.equal(application.data.items["math-accessories"].cover, undefined);
  const restored = app(t, {saved: application.saved()});
  assert.equal(restored.data.items["math-accessories"].enabled, false);
  assert.equal(restored.data.items["math-accessories"].cover, undefined);
});

test("malformed device data is reported, not overwritten", t => {
  const saved = {...oldSettings(), lessons: []};
  const application = app(t, {saved});
  assert.match(application.document.getElementById("device-notice").textContent, /אינם בפורמט תקין/);
  assert.deepEqual(application.saved(), saved);
});

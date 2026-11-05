const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdir } = require("node:fs/promises");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.TEST_ADMIN_URL || "http://127.0.0.1:5173/admin/test/preview.html";
const screenshots = process.env.TEST_SCREENSHOTS;

test("landing page, sliding navigation, group disclosure, route setup and complete history", async () => {
  const browser = await chromium.launch({ channel:"msedge", headless:true });
  const page = await browser.newPage({ viewport:{width:1440,height:900} });
  const errors=[]; page.on("pageerror",error=>errors.push(error.message));
  const go = async (name) => {
    await page.getByRole("button",{name:"Open dashboard menu",exact:true}).click();
    await page.getByRole("dialog",{name:"Dashboard menu"}).waitFor();
    await page.getByRole("link",{name,exact:true}).click();
    assert.equal(await page.getByRole("dialog",{name:"Dashboard menu"}).count(),0);
  };
  const capture = async (name) => {
    if(screenshots) { await mkdir(screenshots,{recursive:true}); await page.screenshot({path:`${screenshots}/${name}.png`,fullPage:true}); }
  };
  try {
    await page.goto(base);
    await page.getByRole("heading",{name:/Keep every group/}).waitFor();
    assert.equal(await page.locator(".checkpoint-map").count(),0);
    assert.equal(await page.getByRole("button",{name:"Clear registered data",exact:true}).count(),0);
    await capture("landing-desktop");
    await page.getByRole("button",{name:"Open dashboard menu"}).click();
    await capture("sidebar-desktop");
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog",{name:"Dashboard menu"}).count(),0);

    await go("Groups");
    await page.getByRole("heading",{name:/Active groups on this route/}).waitFor();
    assert.equal(await page.locator(".group-proximity").count(),0);
    await page.getByRole("button",{name:/Morning explorers/}).click();
    await page.getByRole("heading",{name:"Link devices to check proximity"}).waitFor();
    assert.equal(await page.locator(".gp-member-table tbody tr").count(),4);
    await page.getByRole("button",{name:"Link devices",exact:true}).click();
    assert.equal(await page.getByRole("combobox",{name:/Device for/}).count(),4);
    await page.getByRole("button",{name:"Close details"}).click();
    await capture("groups-desktop");
    const cards = page.getByRole('region', { name: 'Card registration' });
    await cards.getByText('Ready for the next entrance scan', { exact: false }).waitFor();
    const cardName = cards.getByRole('textbox', { name: 'Name for DEMO0000' });
    await cardName.fill('Student One');
    await cardName.locator('..').locator('..').getByRole('button', { name: 'Save name' }).click();
    await page.getByRole('button', { name: 'Sync monitoring data' }).waitFor();
    assert.equal(await cardName.inputValue(), 'Student One');
    await capture('card-registration-desktop');

    await go("History");
    await page.getByRole("button",{name:/Completed college group/}).click();
    await page.getByRole("heading",{name:"Checkpoint log",exact:true}).waitFor();
    assert.equal(await page.locator(".history-detail tbody tr").count(),4);
    await capture("history-desktop");
    await page.getByRole("button",{name:"Next",exact:true}).click();
    await page.getByRole("button",{name:/Earlier group/}).waitFor();
    await page.getByRole("button",{name:"Previous",exact:true}).click();
    await page.getByRole("button",{name:/Completed college group/}).waitFor();

    await go("Routes & checkpoints");
    await page.getByRole("button",{name:"New route",exact:true}).click();
    const editor=page.getByRole("dialog",{name:"Set up your route"});
    await editor.getByLabel("Region",{exact:true}).fill("College test circuit");
    await editor.getByLabel("Route name",{exact:true}).fill("Four physical checkpoints");
    await editor.getByLabel("Display",{exact:false}).selectOption("schematic");
    await editor.locator("summary").filter({hasText:"Add by coordinates"}).click();
    const stops=[["College entrance",10,10],["Main block",65,10],["Library junction",65,65],["College exit",10,65]];
    for(const [index,[name,lat,lng]] of stops.entries()) {
      await editor.getByLabel("Latitude",{exact:true}).fill(String(lat));
      await editor.getByLabel("Longitude",{exact:true}).fill(String(lng));
      await editor.getByRole("button",{name:"Add checkpoint",exact:true}).click();
      await editor.getByRole("textbox",{name:`Checkpoint ${index+1} name`,exact:true}).fill(name);
    }
    await editor.getByRole("button",{name:"Save route",exact:true}).click();
    await page.getByRole("heading",{name:"Four physical checkpoints",exact:true}).waitFor();
    assert.equal(await page.locator(".checkpoint-row").count(),4);
    assert.equal(await page.locator(".schematic-map").count(),1);
    await capture("college-route");

    await page.goto(`${base}?proximity=short#tracked-groups`);
    await page.getByRole("button",{name:/Morning explorers/}).click();
    await page.getByRole("heading",{name:"Waiting for members to return"}).waitFor();
    assert.equal(await page.locator(".proximity-alerts").count(),0);
    await page.goto(`${base}?proximity=alert#dashboard`);
    await page.getByRole("alert",{name:"Proximity alerts"}).waitFor();
    await page.getByRole("button",{name:"View group",exact:true}).first().click();
    await page.getByRole("heading",{name:"Check on your group"}).waitFor();

    for(const viewport of [{width:1440,height:700},{width:1024,height:650},{width:390,height:844}]) {
      await page.setViewportSize(viewport);
      await page.goto(`${base}#dashboard`);
      await page.getByRole("heading",{name:/Keep every group/}).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await capture(`landing-${viewport.width}`);
      await go("Routes & checkpoints");
      await page.locator(".checkpoint-row").first().waitFor();
      const layout=await page.evaluate(()=>({
        overflow:document.documentElement.scrollWidth>innerWidth,
        nestedScroll:[...document.querySelectorAll(".checkpoint-list,.arrival-list")].some(el=>el.scrollHeight>el.clientHeight+1)
      }));
      assert.equal(layout.overflow,false); assert.equal(layout.nestedScroll,false);
      await go("Groups");
      await page.getByRole("button",{name:/Morning explorers/}).click();
      assert.equal(await page.locator(".gp-table-wrap").evaluate(el=>el.scrollWidth>el.clientWidth),false);
      await page.keyboard.press("Escape");
      await go("History");
      await page.getByRole("button",{name:/Completed college group/}).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
});

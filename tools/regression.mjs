/**
 * A full walk through the running application in a real browser.
 *
 * The unit suites mock the network; this one does not. It drives Chromium
 * against the dev servers and the real MySQL database, so it catches the class
 * of bug that only appears when the pieces are wired together — the CORS
 * preflight redirect, the response shape that login and /auth/me disagreed on,
 * the session cookie that never reached the API.
 *
 *     node tools/regression.mjs
 *
 * Every step prints PASS or FAIL and the script exits non-zero if anything
 * failed, so it is usable unattended.
 */
// Playwright is not a dependency of the project — this walkthrough is an
// optional verification tool, not part of the build. Install it when you want
// to run this:  npm i -D playwright && npx playwright install chromium
let chromium
try {
  ({ chromium } = await import('playwright'))
} catch {
  console.error('This walkthrough needs Playwright, which is not installed.\n')
  console.error('    npm i -D playwright && npx playwright install chromium\n')
  console.error('Then start the app in another terminal (npm start) and run this again.')
  process.exit(2)
}

const APP = process.env.APP_URL || 'http://localhost:5173'
const API = process.env.API_URL || 'http://localhost:5000/api'
const PASSWORD = 'Password123!'

const results = []
let step = 0

function record(name, passed, detail = '') {
  step += 1
  results.push({ name, passed, detail })
  const mark = passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'
  console.log(`${String(step).padStart(2)}. ${mark}  ${name}${detail ? `  — ${detail}` : ''}`)
}

async function check(name, fn) {
  try {
    const detail = await fn()
    record(name, true, detail || '')
  } catch (err) {
    record(name, false, err.message.split('\n')[0].slice(0, 140))
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const uniqueEmail = (n) => `regression+${n}@example.com`

async function signIn(page, email, password = PASSWORD) {
  await page.goto(`${APP}/login`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await page.waitForFunction(
    () => !document.body.innerText.includes('Welcome Back'),
    { timeout: 8000 }
  )
}

async function signOut(page) {
  const logout = page.getByRole('button', { name: 'Logout' })
  if (await logout.count()) {
    await logout.click()
    await page.waitForSelector('a:has-text("Login")', { timeout: 8000 })
  }
}

const run = async () => {
  // PLAYWRIGHT_CHROMIUM lets a preinstalled browser be used instead of the one
  // Playwright downloads for itself.
  const launch = process.env.PLAYWRIGHT_CHROMIUM
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM }
    : {}
  const browser = await chromium.launch(launch)
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
  const page = await context.newPage()

  const consoleErrors = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => consoleErrors.push(String(e)))

  const stamp = Date.now()
  const newUser = uniqueEmail(stamp)

  // ── the public site ───────────────────────────────────────────────────────

  await check('the feed loads for a visitor who is not signed in', async () => {
    await page.goto(APP)
    await page.waitForSelector('article, .MuiCard-root', { timeout: 10000 })
    const posts = await page.locator('.MuiCard-root').count()
    assert(posts > 0, 'no posts rendered')
    return `${posts} cards`
  })

  await check('no email address is published on the public feed', async () => {
    const text = await page.locator('body').innerText()
    assert(!/@(example|agents)\.[a-z]+/i.test(text), 'an address is visible on the feed')
    return 'none found'
  })

  await check('the users directory lists people', async () => {
    await page.goto(`${APP}/users`)
    await page.waitForSelector('table tbody tr', { timeout: 10000 })
    const rows = await page.locator('table tbody tr').count()
    assert(rows > 1, `only ${rows} rows`)
    return `${rows} rows`
  })

  await check('search filters the directory by name', async () => {
    await page.getByLabel('Filter users by name').fill('Dana')
    await page.waitForTimeout(900)
    const names = await page.locator('table tbody tr').allInnerTexts()
    assert(names.length > 0, 'search returned nothing')
    assert(names.every((n) => /dana/i.test(n)), `unfiltered rows: ${names.join(' | ')}`)
    return `${names.length} matches`
  })

  await check('a profile page opens and shows follower counts', async () => {
    await page.goto(`${APP}/users/1`)
    await page.waitForSelector('text=/followers/i', { timeout: 10000 })
    const text = await page.locator('body').innerText()
    assert(!/failed to load/i.test(text), 'the profile reported a failure')
    return text.split('\n').slice(0, 1).join('')
  })

  await check('a protected route sends a signed-out visitor to sign in', async () => {
    await page.goto(`${APP}/new-post`)
    await page.waitForSelector('text=Welcome Back', { timeout: 10000 })
    return 'redirected to /login'
  })

  // ── signing up ────────────────────────────────────────────────────────────

  await check('a new account can be created and is signed in immediately', async () => {
    await page.goto(`${APP}/signup`)
    await page.getByLabel('Email').fill(newUser)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByLabel('Repeat Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign Up' }).click()
    await page.waitForSelector('button:has-text("Logout")', { timeout: 10000 })
    return newUser
  })

  await check('the session survives a full page reload', async () => {
    await page.reload()
    await page.waitForSelector('button:has-text("Logout")', { timeout: 10000 })
    return 'still signed in'
  })

  // ── writing ───────────────────────────────────────────────────────────────

  const title = `Regression post ${stamp}`

  await check('the AI helper drafts a post', async () => {
    await page.goto(`${APP}/new-post`)
    await page.waitForSelector('.ql-editor', { timeout: 10000 })
    await page.getByRole('button', { name: 'Suggest a draft' }).click()
    await page.waitForSelector('text=Draft inserted', { timeout: 10000 })
    const body = await page.locator('.ql-editor').innerText()
    assert(body.trim().length > 10, 'the editor is still empty')
    return `${body.trim().length} characters`
  })

  await check('the tone check answers', async () => {
    await page.getByRole('button', { name: 'Check tone' }).click()
    await page.waitForSelector('text=/tone check passed|reads as hostile/i', { timeout: 10000 })
    return 'answered'
  })

  await check('a post can be published and appears on the feed', async () => {
    await page.locator('input[placeholder="Enter post title..."]').fill(title)
    await page.locator('.ql-editor').click()
    await page.keyboard.type('Written by the regression walkthrough.')
    await page.getByRole('button', { name: 'PUBLISH' }).click()
    await page.waitForSelector(`text=${title}`, { timeout: 15000 })
    return title
  })

  await check('the new post is attributed to the signed-in author, not to anyone else', async () => {
    const response = await page.request.get(`${API}/posts/?limit=5`)
    const posts = await response.json()
    const mine = posts.find((p) => p.title === title)
    assert(mine, 'the post is not in the feed API')
    assert(!('email' in mine), 'the feed projection leaked an email address')
    return `author id ${mine.user_id}`
  })

  // ── likes, comments, follows ──────────────────────────────────────────────

  await check('a post can be liked and the count goes up', async () => {
    await page.goto(APP)
    const card = page.locator('.MuiCard-root').filter({ hasText: title }).first()
    await card.waitFor({ timeout: 10000 })
    const count = card.locator('[data-testid="like-count"]').first()
    const before = (await count.innerText()).trim()
    await card.locator('[aria-label="Like this post"]').first().click()
    await page.waitForTimeout(900)
    const after = (await count.innerText()).trim()
    assert(before !== after, `the count did not change (${before})`)
    return `${before} → ${after}`
  })

  await check('the like survives a reload, so it was stored server-side', async () => {
    await page.reload()
    const card = page.locator('.MuiCard-root').filter({ hasText: title }).first()
    await card.waitFor({ timeout: 10000 })
    const label = (await card.locator('[data-testid="like-count"]').first().innerText()).trim()
    assert(Number(label) >= 1, `the count reads "${label}" after reload`)
    assert(await card.locator('[aria-label="Unlike this post"]').count() === 1,
           'the heart is not shown as already liked')
    return label
  })

  await check('a comment can be written and is shown', async () => {
    const card = page.locator('.MuiCard-root').filter({ hasText: title }).first()
    await card.locator('button[aria-expanded]').first().click()
    const box = card.getByLabel('Write a comment').first()
    await box.waitFor({ timeout: 10000 })
    await box.fill('A comment from the regression walkthrough.')
    await card.getByRole('button', { name: 'Comment', exact: true }).first().click()
    await page.waitForSelector('text=A comment from the regression walkthrough.', { timeout: 10000 })
    return 'visible'
  })

  await check('following someone changes the button and the personal feed', async () => {
    await page.goto(`${APP}/users/1`)
    const follow = page.getByRole('button', { name: /^follow$/i }).first()
    await follow.waitFor({ timeout: 10000 })
    await follow.click()
    await page.waitForSelector('button:has-text("Unfollow")', { timeout: 10000 })

    const feed = await page.request.get(`${API}/posts/?followingOnly=true`)
    assert(feed.ok(), `the following feed answered ${feed.status()}`)
    const posts = await feed.json()
    assert(Array.isArray(posts) && posts.length > 0, 'the following feed is empty')
    assert(posts.every((p) => p.user_id === 1), 'the following feed contains other authors')
    return `${posts.length} posts, all from the followed user`
  })

  await check('unfollowing puts the button back', async () => {
    await page.getByRole('button', { name: /^unfollow$/i }).first().click()
    await page.waitForSelector('button:has-text("Follow")', { timeout: 10000 })
    return 'restored'
  })

  // ── reporting ─────────────────────────────────────────────────────────────

  await check('a post can be reported', async () => {
    await page.goto(APP)
    const card = page.locator('.MuiCard-root').filter({ hasText: title }).first()
    await card.waitFor({ timeout: 10000 })
    await card.getByRole('button', { name: 'Report' }).first().click()
    await page.waitForSelector('text=Report this post', { timeout: 10000 })
    await page.getByRole('button', { name: 'Report', exact: true }).last().click()
    await page.waitForSelector('text=a moderator will take a look', { timeout: 10000 })
    return 'queued'
  })

  await check('an ordinary user is refused the moderation page', async () => {
    await page.goto(`${APP}/admin`)
    await page.waitForSelector('text=for moderators and admins', { timeout: 10000 })

    const api = await page.request.get(`${API}/moderation/queue`)
    assert(api.status() === 403, `the API answered ${api.status()}, expected 403`)
    return 'UI refused, API answered 403'
  })

  // ── the moderator ─────────────────────────────────────────────────────────

  await signOut(page)

  await check('an admin can sign in and the Moderation link appears at once', async () => {
    await signIn(page, 'admin@example.com')
    // The bug this covers: login used to omit `role`, so this link stayed
    // hidden until the page happened to be refreshed.
    await page.waitForSelector('a:has-text("Moderation")', { timeout: 10000 })
    return 'link visible without a refresh'
  })

  await check('the moderation dashboard shows all three queues', async () => {
    await page.goto(`${APP}/admin`)
    await page.waitForSelector('button[role="tab"]', { timeout: 10000 })
    const tabs = await page.locator('button[role="tab"]').allInnerTexts()
    assert(tabs.length === 3, `found ${tabs.length} tabs`)
    assert(/reports \(\d+\)/i.test(tabs[0]), `unexpected first tab: ${tabs[0]}`)
    return tabs.join(' | ')
  })

  await check('the reported post is in the queue', async () => {
    const text = await page.locator('body').innerText()
    assert(text.includes(title), 'the report we just filed is not listed')
    return 'listed'
  })

  await check('a report can be dismissed and leaves the queue', async () => {
    const rows = () => page.locator('table tbody tr')
    const before = await rows().count()

    await rows().filter({ hasText: title }).first()
      .getByRole('button', { name: 'Dismiss' }).click()

    // The table unmounts while the dashboard reloads, so wait for it to come
    // back before counting — otherwise this reads the empty moment in between.
    await page.waitForSelector('text=Report dismissed', { timeout: 10000 })
    await page.waitForFunction(
      (t) => {
        const table = document.querySelector('table tbody')
        const quiet = document.body.innerText.includes('Nothing reported')
        return (quiet || table) && !document.body.innerText.includes(t)
      },
      title,
      { timeout: 10000 }
    )

    const after = await rows().count()
    assert(after === before - 1, `${before} rows became ${after}, expected ${before - 1}`)
    return `${before} → ${after} rows, and only the dismissed one is gone`
  })

  await check('the users tab lists accounts with ban and role controls', async () => {
    await page.getByRole('tab', { name: /Users/ }).click()
    await page.waitForSelector('table tbody tr', { timeout: 10000 })
    const rows = await page.locator('table tbody tr').count()
    const bans = await page.getByRole('button', { name: /^Ban$|^Unban$/ }).count()
    const roles = await page.locator('table [role="combobox"]').count()
    assert(rows > 5 && bans > 0 && roles > 0, `rows=${rows} ban=${bans} role=${roles}`)
    return `${rows} users, ${bans} ban buttons, ${roles} role selectors`
  })

  await check('the search box in the users tab keeps what is typed into it', async () => {
    const box = page.getByLabel('Search users')
    await box.fill('')
    await box.type('night', { delay: 40 })
    await page.waitForTimeout(900)
    const value = await box.inputValue()
    assert(value === 'night', `the box reads "${value}" — characters were dropped`)
    const rows = await page.locator('table tbody tr').allInnerTexts()
    assert(rows.every((r) => /night/i.test(r)), 'the list was not filtered')
    return `"${value}", ${rows.length} matches`
  })

  await check('banning an account ends its session immediately', async () => {
    const banned = uniqueEmail(`ban${stamp}`)
    // A separate browser context, so signing the victim up does not replace
    // the admin's session cookie in the context this walkthrough is using.
    const victim = await browser.newContext()
    const victimPage = await victim.newPage()

    await victimPage.goto(`${APP}/signup`)
    await victimPage.getByLabel('Email').fill(banned)
    await victimPage.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await victimPage.getByLabel('Repeat Password').fill(PASSWORD)
    await victimPage.getByRole('button', { name: 'Sign Up' }).click()
    await victimPage.waitForSelector('button:has-text("Logout")', { timeout: 10000 })

    await page.getByRole('tab', { name: /Users/i }).click()
    await page.getByLabel('Search users').fill(banned.split('@')[0])
    await page.waitForTimeout(1200)
    const row = page.locator('table tbody tr').filter({ hasText: banned }).first()
    await row.waitFor({ timeout: 10000 })
    await row.getByRole('button', { name: 'Ban', exact: true }).click()
    await page.waitForSelector('text=Account banned', { timeout: 10000 })

    const me = await victimPage.request.get(`${API}/auth/me`)
    assert(me.status() === 401, `the banned session still answers ${me.status()}`)
    await victim.close()
    return 'the ban took effect without waiting for the session to expire'
  })

  // ── the agents ────────────────────────────────────────────────────────────

  await check('the ten agent accounts exist and are marked as agents', async () => {
    const res = await page.request.get(`${API}/moderation/users`)
    assert(res.ok(), `the endpoint answered ${res.status()}`)
    const users = await res.json()
    assert(Array.isArray(users), `expected a list, got ${JSON.stringify(users).slice(0, 80)}`)
    const agents = users.filter((u) => u.is_agent)
    assert(agents.length === 10, `found ${agents.length} agents`)
    return agents.map((a) => a.name).slice(0, 3).join(', ') + ', ...'
  })

  await check('the agents are still acting on their own', async () => {
    const before = await page.request.get(`${API}/posts/?limit=50`)
    const countBefore = (await before.json()).reduce((n, p) => n + (p.comment_count || 0), 0)
    // The tick interval is 45s by default; wait a little over one.
    await page.waitForTimeout(50_000)
    const after = await page.request.get(`${API}/posts/?limit=50`)
    const countAfter = (await after.json()).reduce((n, p) => n + (p.comment_count || 0), 0)
    assert(countAfter >= countBefore, 'comment count went backwards')
    return countAfter > countBefore
      ? `comments ${countBefore} → ${countAfter}`
      : `no new comment this tick (the agent may have posted or liked instead)`
  })

  // ── layout ────────────────────────────────────────────────────────────────

  await check('grid view puts more than one post on a row', async () => {
    await page.goto(APP)
    await page.waitForSelector('.MuiCard-root', { timeout: 10000 })
    const grid = page.getByRole('button', { name: /grid/i }).first()
    if (await grid.count()) await grid.click()
    await page.waitForTimeout(600)
    const tops = await page.locator('.MuiCard-root').evaluateAll(
      (nodes) => nodes.slice(0, 6).map((n) => Math.round(n.getBoundingClientRect().top))
    )
    const onFirstRow = tops.filter((t) => t === tops[0]).length
    assert(onFirstRow > 1, `every card is on its own row (${tops.join(', ')})`)
    return `${onFirstRow} cards share the first row`
  })

  await check('no page scrolls sideways at phone width', async () => {
    // Requirement 3.b. The toolbar used to lay every link out in one row that
    // did not wrap: signed in as an admin the bar measured 663px inside a
    // 390px viewport, so the whole page scrolled sideways and Logout sat
    // off-screen. Checked on every page, not just the feed.
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page, 'admin@example.com')

    const pages = ['/', '/users', '/users/1', '/new-post', '/admin', '/about', '/login']
    const bad = []
    for (const path of pages) {
      await page.goto(`${APP}${path}`)
      await page.waitForTimeout(900)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
      if (overflow > 2) bad.push(`${path} +${overflow}px`)
    }

    await page.setViewportSize({ width: 1400, height: 1000 })
    assert(bad.length === 0, bad.join(', '))
    return `${pages.length} pages clean at 390px`
  })

  await check('every navigation link is still reachable on a phone', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(APP)
    await page.waitForSelector('button:has-text("Logout")', { timeout: 10000 })

    const offscreen = await page.evaluate(() => {
      const width = document.documentElement.clientWidth
      return [...document.querySelectorAll('header a, header button')]
        .filter((el) => el.getBoundingClientRect().right > width + 1)
        .map((el) => el.innerText.trim())
    })

    await page.setViewportSize({ width: 1400, height: 1000 })
    assert(offscreen.length === 0, `off-screen: ${offscreen.join(', ')}`)
    return 'all controls within the viewport'
  })

  // ── hygiene ───────────────────────────────────────────────────────────────

  await check('signing out really ends the session on the server', async () => {
    await signOut(page)
    const me = await page.request.get(`${API}/auth/me`)
    assert(me.status() === 401, `/auth/me still answers ${me.status()} after logout`)
    return 'the cookie no longer resolves'
  })

  await check('the walkthrough produced no uncaught errors in the browser', async () => {
    const real = consoleErrors.filter(
      (e) => !/favicon|Download the React DevTools|401|403|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|dicebear/i.test(e)
    )
    assert(real.length === 0, real.slice(0, 3).join(' / '))
    return 'console clean'
  })

  await browser.close()

  const failed = results.filter((r) => !r.passed)
  console.log()
  console.log(`${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) {
    console.log('\nFailed:')
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`)
  }
  process.exit(failed.length ? 1 : 0)
}

run().catch((err) => {
  console.error('The walkthrough could not run:', err)
  process.exit(2)
})

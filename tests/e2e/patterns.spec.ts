import {test, expect, type Page} from '@playwright/test'

/* The registered pattern type names (PatternsEnum). Source of truth is the
 * runtime registry exposed as window._PatternsEnum; we assert the page agrees
 * with this list so a forgotten/renamed pattern fails loudly. */
const PATTERN_TYPES = [
  'newton',
  'mandelbrot',
  'xor',
  'flower_moire',
  'moire_newton',
  'moire',
  'newton_trace',
  'newton2',
  'fractal_trace',
  'graph',
  'mountain',
  'clothoid',
  'trig_escape',
] as const

declare global {
  interface Window {
    _appstate: any
    _gl: WebGL2RenderingContext
    _PatternsEnum: {keys: Record<string, string>; values: Record<string, number>}
    redraw_viewport: () => void
    force_redraw_viewport: () => void
  }
}

async function waitForApp(page: Page) {
  await page.waitForFunction(
    () => !!(window._appstate?.ctx?.pattern && window._PatternsEnum && window._gl),
    undefined,
    {timeout: 30000}
  )
}

/* Switch the active pattern and let it accumulate render samples. Returns a
 * summary of what was actually rendered (so the test can assert the canvas is
 * not blank — a robust oracle for stochastic patterns that doesn't flake on
 * per-pixel sampling noise the way exact-pixel comparison does). */
async function renderPattern(page: Page, typeName: string) {
  await page.evaluate((t) => {
    window._appstate.model.setActivePattern(t)
    window.force_redraw_viewport()
  }, typeName)

  /* Wait until the pattern's shader has linked and a few samples have landed. */
  await page
    .waitForFunction(
      () => {
        const p = window._appstate?.ctx?.pattern
        return !!p && p.drawSample >= 4
      },
      undefined,
      {timeout: 20000}
    )
    .catch(() => {})

  await page.waitForTimeout(750)

  return page.evaluate(() => {
    const gl = window._gl
    const w = gl.canvas.width
    const h = gl.canvas.height
    const px = new Uint8Array(w * h * 4)
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px)
    let nonBlack = 0
    let maxBrightness = 0
    for (let i = 0; i < px.length; i += 4) {
      const v = px[i] + px[i + 1] + px[i + 2]
      if (v > 10) nonBlack++
      if (v > maxBrightness) maxBrightness = v
    }
    const p = window._appstate.ctx.pattern
    return {
      type: p.typeName,
      drawSample: p.drawSample,
      nonBlackRatio: nonBlack / (w * h),
      maxBrightness,
    }
  })
}

test.beforeEach(async ({page}) => {
  /* Clear any stale autosave (incompatible serialized state breaks startup). */
  await page.addInitScript(() => {
    try {
      localStorage.clear()
    } catch {}
  })
  await page.goto('/')
  await waitForApp(page)
})

test('registry matches expected pattern list', async ({page}) => {
  const types = await page.evaluate(() => Object.values(window._PatternsEnum.keys))
  expect(new Set(types)).toEqual(new Set(PATTERN_TYPES))
})

for (const typeName of PATTERN_TYPES) {
  test(`renders pattern: ${typeName}`, async ({page}, testInfo) => {
    const result = await renderPattern(page, typeName)

    /* Visual record: attach a screenshot as a test artifact (viewable in the
     * Playwright report) rather than doing a flaky exact-pixel comparison. */
    const shot = await page.screenshot()
    await testInfo.attach(`pattern-${typeName}`, {body: shot, contentType: 'image/png'})

    /* Content oracle: the pattern must have switched and rendered visible,
     * non-trivial content (catches black-screen / failed-shader regressions). */
    expect(result.type).toBe(typeName)
    expect(result.maxBrightness, 'canvas should not be black').toBeGreaterThan(20)
    expect(result.nonBlackRatio, 'canvas should have rendered content').toBeGreaterThan(0.02)
  })
}

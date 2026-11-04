import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

async function settled(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

// Project known metric test positions with the public top-view framing algorithm.
// No renderer state, React internals or product test globals are inspected.
async function floorPoint(page: Page, x: number, z: number, height = 0) {
  await settled(page);
  const box = await page.locator('.visual-queue-editor canvas').boundingBox();
  if (!box) throw new Error('Canvas ausente');
  const tan = Math.tan(21 * Math.PI / 180);
  const distance = Math.max(9.2 / (2 * tan), 11.2 / (2 * tan * box.width / box.height)) * 1.2;
  const scale = box.height / (2 * (distance - height) * tan);
  return { x: box.x + box.width / 2 + (x - 5) * scale, y: box.y + box.height / 2 + (z - 4) * scale };
}

async function clickFloor(page: Page, x: number, z: number, height = 0) {
  const point = await floorPoint(page, x, z, height);
  if (test.info().project.use.hasTouch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

async function dragWorld(page: Page, from: [number, number], to: [number, number], height = 0) {
  const start = await floorPoint(page, ...from, height);
  const end = await floorPoint(page, ...to, height);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
  await settled(page);
}

test.beforeEach(async ({ page }) => {
  if (!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD) throw new Error('Defina TEST_EMAIL e TEST_PASSWORD para uma conta local de QA.');
  const login = await page.request.post('/api/auth/sign-in/email', {
    headers: { origin: process.env.TEST_BASE_URL || 'http://localhost:3000' },
    data: { email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD },
  });
  expect(login.status()).toBe(200);
});

test('canvas: pessoas sem percurso, +1, drag, fita, área e salvar/reabrir', async ({ page }, info) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.goto('/projects/new');
  await expect(page.getByLabel('Largura medida em metros')).toBeVisible();
  await expect(page.getByRole('button', { name: /Polígono por coordenadas/ })).toHaveCount(0);
  await expect(page.getByLabel(/Altura medida/)).toHaveCount(0);
  await page.getByLabel('Largura medida em metros').fill('10');
  await page.getByLabel('Profundidade medida em metros').fill('8');
  await page.getByRole('button', { name: 'Montar no canvas', exact: true }).click();
  await expect(page.getByLabel('Editor visual da fila')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Selecionar ou arrastar pessoa para a planta' })).toBeVisible();
  await expect.poll(() => page.locator('.visual-queue-editor canvas').evaluate((element) => element.clientHeight)).toBeGreaterThan(200);
  const initialLayout = await page.evaluate(() => ({
    canvasHeight: document.querySelector('canvas')?.clientHeight,
    viewport: [innerWidth, innerHeight],
    document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
  }));
  await writeFile(info.outputPath('layout.json'), JSON.stringify(initialLayout, null, 2));
  await expect(page.getByRole('button', { name: 'Nomear e salvar', exact: true })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: 'Selecionar ou arrastar pessoa para a planta' })).toBeInViewport({ ratio: 1 });

  const canvas = page.locator('.visual-queue-editor canvas');
  await settled(page);
  const initialCamera = await canvas.screenshot();
  await page.getByRole('button', { name: 'Inclinar para baixo', exact: true }).click();
  await settled(page);
  expect((await canvas.screenshot()).equals(initialCamera)).toBe(false);
  await page.getByRole('button', { name: /Repor/ }).click();
  await settled(page);
  for (const label of ['Girar à esquerda', 'Girar à direita', 'Inclinar para cima', 'Aproximar', 'Afastar', 'Mover à esquerda', 'Mover à direita', 'Mover para cima', 'Mover para baixo']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.getByRole('button', { name: 'Repor câmera', exact: true }).click();
  }

  await page.getByRole('button', { name: 'Selecionar ou arrastar pessoa para a planta' }).click();
  await clickFloor(page, 5, 6);
  await expect(page.locator('.queue-canvas-foot')).toContainText('1 pessoas');
  await expect(page.getByLabel('Pessoa selecionada')).toBeVisible();

  // Cancel a real active browser pointer, then deliver the late pointerup.
  // This verifies event cleanup, not physical OS gesture cancellation.
  const historyBeforeCancel = await page.locator('.queue-history-bar').textContent();
  await canvas.evaluate((element) => element.addEventListener('pointerdown', (event) => {
    (element as HTMLElement).dataset.qaPointer = String((event as PointerEvent).pointerId);
  }, { once: true, capture: true }));
  const cancelStart = await floorPoint(page, 5, 6, 1.65);
  const cancelEnd = await floorPoint(page, 5.3, 6, 1.65);
  const beforeDrag = await canvas.screenshot();
  await page.mouse.move(cancelStart.x, cancelStart.y);
  await page.mouse.down();
  await page.mouse.move(cancelEnd.x, cancelEnd.y, { steps: 3 });
  await settled(page);
  expect((await canvas.screenshot()).equals(beforeDrag)).toBe(false);
  await canvas.evaluate((element) => element.dispatchEvent(new PointerEvent('pointercancel', {
    pointerId: Number((element as HTMLElement).dataset.qaPointer), pointerType: 'mouse', bubbles: true,
  })));
  await page.mouse.up();
  await settled(page);
  await expect(page.locator('.queue-canvas-foot')).toContainText('1 pessoas');
  expect(await page.locator('.queue-history-bar').textContent()).toBe(historyBeforeCancel);

  // The in-scene +1 control must commit once, without dragging its parent person.
  await clickFloor(page, 5, 5.2, 0.07);
  await expect(page.locator('.queue-canvas-foot')).toContainText('2 pessoas');
  await page.getByRole('button', { name: 'Girar +15°', exact: true }).click();
  await page.getByLabel(/Espaçamento/).selectOption('1');
  await page.getByRole('button', { name: '+1 atrás', exact: true }).click();
  await expect(page.locator('.queue-canvas-foot')).toContainText('3 pessoas');
  await page.getByRole('button', { name: '+1 atrás', exact: true }).click();
  await expect(page.locator('.queue-canvas-foot')).toContainText('4 pessoas');

  await page.getByRole('button', { name: 'Mover no piso', exact: true }).click();
  await clickFloor(page, 7, 6);
  await expect(page.getByRole('status').filter({ hasText: 'Pessoa movida.' })).toBeVisible();
  await dragWorld(page, [7, 6], [7, 5.4], 0.8);
  await expect(page.getByRole('status').filter({ hasText: 'Pessoa movida.' })).toBeVisible();

  // Drag one item from the palette; place the other by selecting then touching floor.
  const postPalette = page.getByRole('button', { name: 'Selecionar ou arrastar poste para a planta' });
  await postPalette.scrollIntoViewIfNeeded();
  const paletteBox = await postPalette.boundingBox();
  if (!paletteBox) throw new Error('Paleta ausente');
  const postA = await floorPoint(page, 2, 2);
  await page.mouse.move(paletteBox.x + paletteBox.width / 2, paletteBox.y + paletteBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(postA.x, postA.y, { steps: 15 });
  await page.mouse.up();
  await postPalette.click();
  await clickFloor(page, 8, 2);
  await page.getByRole('button', { name: 'Conectar postes com fita' }).click();
  await clickFloor(page, 2, 2, 0.035);
  await clickFloor(page, 8, 2, 0.035);
  await expect(page.getByRole('button', { name: 'Conectar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Conectar', exact: true }).click();

  await page.getByRole('button', { name: 'Área restrita', exact: true }).click();
  await dragWorld(page, [1, 5], [2, 6]);
  await expect(page.getByLabel('Confirmar área desenhada')).toBeVisible();
  await page.getByLabel('Confirmar área desenhada').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.locator('.queue-canvas-foot')).toContainText('0 áreas');
  await page.getByRole('button', { name: 'Área restrita', exact: true }).click();
  await dragWorld(page, [1, 5], [2, 6]);
  await page.getByRole('button', { name: 'Usar área', exact: true }).click();
  await expect(page.locator('.queue-canvas-foot')).toContainText('1 áreas');
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click();
  await expect(page.locator('.queue-canvas-foot')).toContainText('0 áreas');
  await page.getByRole('button', { name: 'Refazer', exact: true }).click();
  await expect(page.locator('.queue-canvas-foot')).toContainText('1 áreas');

  await page.locator('.editor-more-tools summary').click();
  await page.getByRole('button', { name: 'Ajustar cantos da planta', exact: true }).click();
  await dragWorld(page, [0, 0], [0.5, 0.5], 0.08);
  await expect(page.getByRole('button', { name: 'Confirmar planta', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar planta', exact: true }).click();

  await page.screenshot({ path: info.outputPath('editor.png'), fullPage: true });
  if (page.viewportSize()!.width <= 760) await page.getByRole('button', { name: 'Recolher', exact: true }).click();
  await page.getByRole('button', { name: 'Perspectiva', exact: true }).click();
  await settled(page);
  await page.screenshot({ path: info.outputPath('perspective.png'), fullPage: true });
  const viewport = page.viewportSize()!;
  const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, height: innerHeight }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(viewport.width);
  if (viewport.width <= 760) expect(layout.scrollHeight).toBeLessThanOrEqual(layout.height + 2);

  await page.getByRole('button', { name: 'Nomear e salvar', exact: true }).click();
  await page.getByLabel('Nome do projeto', { exact: true }).fill(`QA canvas ${info.project.name} ${Date.now()}`);
  const savedResponse = page.waitForResponse((response) => response.url().endsWith('/api/projects') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Salvar projeto', exact: true }).click();
  const saved = await savedResponse;
  expect(saved.status(), await saved.text()).toBe(201);
  const project = await saved.json();
  expect(project.scene.routes).toHaveLength(0);
  expect(project.scene.people).toHaveLength(4);
  expect(project.scene.people[3].position.z).toBeLessThan(5.8);
  expect(project.scene.people[3].position.z).toBeGreaterThan(5);
  expect(project.scene.people.every((person: { routeId: string | null; distanceAlongRouteMeters: number | null }) => person.routeId === null && person.distanceAlongRouteMeters === null)).toBe(true);
  expect(project.scene.posts).toHaveLength(2);
  expect(project.scene.posts[0].baseRadiusMeters).toBe(0.08);
  expect(project.scene.belts).toHaveLength(1);
  expect(project.scene.restrictedAreas).toHaveLength(1);
  expect(project.scene.environment.perimeter[0].x).toBeGreaterThan(0.3);
  expect(project.scene.environment.perimeter[0].z).toBeGreaterThan(0.3);
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}$`));
  await page.getByRole('link', { name: 'Editar fila', exact: true }).click();
  await expect(page.locator('.queue-canvas-foot')).toContainText('4 pessoas');
  const reopened = await page.request.get(`/api/projects/${project.id}`);
  expect((await reopened.json()).scene).toEqual(project.scene);
  expect(browserErrors).toEqual([]);
});

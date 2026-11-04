import { type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { test, expect, legacyId } from './fixtures';

async function settled(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
// Metric projection of the public top framing for a 10 x 8 m room.
async function floorPoint(page: Page, x: number, z: number, height = 0) {
  await settled(page);
  const box = await page.locator('.visual-queue-editor canvas').boundingBox();
  if (!box) throw new Error('Canvas ausente');
  const tan = Math.tan(21 * Math.PI / 180);
  const distance = Math.max(9.2 / (2 * tan), 11.2 / (2 * tan * box.width / box.height)) * 1.2;
  const scale = box.height / (2 * (distance - height) * tan);
  return { x: box.x + box.width / 2 + (x - 5) * scale, y: box.y + box.height / 2 + (z - 4) * scale };
}
async function touchFloor(page: Page, x: number, z: number, height = 0) {
  const p = await floorPoint(page, x, z, height);
  if (test.info().project.use.hasTouch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}
async function dragFloor(page: Page, start: [number, number], end: [number, number]) {
  const a = await floorPoint(page, ...start); const b = await floorPoint(page, ...end);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 }); await page.mouse.up(); await settled(page);
}
async function noAr(page: Page) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'xr', { configurable: true, value: undefined }));
}

test('medidas: fila ligada, fita, área, cancelamento e salvar/reabrir sem login', async ({ page, api }, info) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await noAr(page);
  await page.goto('/projects/new');
  await expect(page.getByText('A medição pela câmera não está disponível neste aparelho', { exact: true })).toBeVisible();
  await page.getByLabel('Largura medida em metros').fill('10');
  await page.getByLabel('Profundidade medida em metros').fill('8');
  await page.getByRole('button', { name: 'Montar no canvas', exact: true }).click();
  await expect(page.getByLabel('Editor visual da fila')).toBeVisible();
  await page.getByRole('button', { name: 'Planta', exact: true }).click();
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.getByRole('button', { name: 'Posicionar início da fila', exact: true }).click();
  await touchFloor(page, 5, 6);
  await expect(page.locator('.queue-canvas-foot')).toContainText('1 pessoa');
  const canvas = page.locator('.visual-queue-editor canvas');
  const history = await page.locator('.undo-redo-count').textContent();
  await canvas.evaluate((element) => element.addEventListener('pointerdown', (event) => {
    (element as HTMLElement).dataset.testPointer = String((event as PointerEvent).pointerId);
  }, { once: true, capture: true }));
  const start = await floorPoint(page, 5, 6, 1.65); const end = await floorPoint(page, 5.5, 6, 1.65);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 4 });
  await canvas.evaluate((element) => element.dispatchEvent(new PointerEvent('pointercancel', { pointerId: Number((element as HTMLElement).dataset.testPointer), pointerType: 'mouse', bubbles: true })));
  await page.mouse.up(); await settled(page);
  expect(await page.locator('.undo-redo-count').textContent()).toBe(history);
  await expect(page.locator('.queue-canvas-foot')).toContainText('1 pessoa');
  const append = page.getByRole('toolbar', { name: 'Adicionar itens' }).getByRole('button', { name: 'Acrescentar uma pessoa no fim da fila' });
  await append.click(); await expect(page.locator('.queue-canvas-foot')).toContainText('2 pessoas');
  // The editor intentionally debounces duplicate touch/click events for 350 ms.
  await page.waitForTimeout(400);
  await append.click(); await expect(page.locator('.queue-canvas-foot')).toContainText('3 pessoas');
  await page.getByRole('combobox', { name: /Espaçamento da fila/ }).selectOption('1');
  await page.getByRole('button', { name: 'Girar +15°', exact: true }).click();
  const post = page.getByRole('button', { name: 'Selecionar ou arrastar poste para a planta' });
  await post.click(); await touchFloor(page, 2, 2);
  await post.click(); await touchFloor(page, 8, 2);
  await page.getByRole('button', { name: 'Conectar postes com fita' }).click();
  await touchFloor(page, 2, 2, 0.475); await touchFloor(page, 8, 2, 0.475);
  await page.getByRole('button', { name: 'Conectar', exact: true }).click();
  await page.getByRole('button', { name: 'Área restrita', exact: true }).click();
  await dragFloor(page, [1, 4.5], [2, 5.5]);
  await page.getByRole('button', { name: 'Usar área', exact: true }).click();
  await page.getByRole('button', { name: 'Desfazer última alteração', exact: true }).click();
  await expect(page.locator('.queue-canvas-foot')).toContainText('0 áreas');
  await page.getByRole('button', { name: 'Refazer alteração', exact: true }).click();
  await expect(page.locator('.queue-canvas-foot')).toContainText('1 área');
  await page.screenshot({ path: info.outputPath('editor.png'), fullPage: true });
  const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, height: innerHeight, scrollHeight: document.documentElement.scrollHeight }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
  if (layout.width <= 760) expect(layout.scrollHeight).toBeLessThanOrEqual(layout.height + 2);
  await page.getByRole('button', { name: 'Nomear e salvar', exact: true }).click();
  await page.getByLabel('Nome do projeto', { exact: true }).fill(`E2E ${info.project.name}`);
  const response = page.waitForResponse((r) => r.url().endsWith('/api/projects') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Salvar projeto', exact: true }).click();
  const savedResponse = await response; expect(savedResponse.status(), await savedResponse.text()).toBe(201);
  const saved = await savedResponse.json();
  expect(saved.scene.schemaVersion).toBe(2); expect(saved.scene.queue.personIds).toHaveLength(3);
  expect(saved.scene.people).toHaveLength(3); expect(saved.scene.posts).toHaveLength(2);
  expect(saved.scene.belts).toHaveLength(1); expect(saved.scene.restrictedAreas).toHaveLength(1);
  expect(saved.scene.environment.measurement.source).toBe('manual');
  const ordered = saved.scene.queue.personIds.map((id: string) => saved.scene.people.find((person: { id: string }) => person.id === id));
  for (let i = 1; i < ordered.length; i++) expect(Math.hypot(ordered[i].position.x - ordered[i - 1].position.x, ordered[i].position.z - ordered[i - 1].position.z)).toBeCloseTo(1, 6);
  await expect(page).toHaveURL(new RegExp(`/projects/${saved.id}$`));
  await expect(page.getByRole('link', { name: 'Ver em AR', exact: true })).toHaveCount(0);
  for (let i = 0; i < 3; i++) {
    await page.getByRole('link', { name: 'Editar fila', exact: true }).click();
    await expect(page.locator('.queue-canvas-foot')).toContainText('3 pessoas');
    await page.goto(`/projects/${saved.id}`);
  }
  const reopened = await api.get(`/api/projects/${saved.id}`); expect((await reopened.json()).scene).toEqual(saved.scene);
  expect(errors).toEqual([]);
});

test('legado abre sem perda e só passa a fila ligada após conversão explícita', async ({ page, api }) => {
  await noAr(page);
  const before = await (await api.get(`/api/projects/${legacyId}`)).json();
  expect(before.scene.queue.personIds).toHaveLength(0); expect(before.scene.people).toHaveLength(2);
  await page.goto(`/projects/${legacyId}/edit`);
  await page.getByRole('button', { name: 'Ligar as pessoas soltas em uma fila', exact: true }).click();
  const response = page.waitForResponse((r) => r.url().endsWith(`/api/projects/${legacyId}`) && r.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  expect((await response).status()).toBe(200);
  const after = await (await api.get(`/api/projects/${legacyId}`)).json();
  expect(after.revision).toBe(before.revision + 1); expect(after.scene.schemaVersion).toBe(2);
  expect(after.scene.queue.personIds).toEqual(['legacy-a', 'legacy-b']);
  expect(after.scene.people[0]).toEqual(before.scene.people[0]);
});

test('montagem AR real com sessão simulada entrega planta ao editor e salva webxr', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript({ path: fileURLToPath(new URL('../../features/ar/testing/fake-xr.js', import.meta.url)) });
  await page.goto('/projects/new');
  await page.getByRole('button', { name: 'Começar a medir', exact: true }).click();
  for (const [x, z] of [[1, 1], [11, 1], [11, 9], [1, 9]]) {
    await page.evaluate(([x, z]) => { (window as any).__xr.hit = { x, y: 0, z }; }, [x, z]);
    await settled(page); await page.getByRole('button', { name: 'Marcar canto', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Fechar planta', exact: true }).click();
  await page.getByRole('button', { name: 'Montar na câmera', exact: true }).click();
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await page.evaluate(() => { (window as any).__xr.hit = { x: 3, y: 0, z: 3 }; });
  await settled(page); await page.getByRole('button', { name: 'Colocar poste', exact: true }).click();
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await page.evaluate(() => { (window as any).__xr.hit = { x: 6, y: 0, z: 7 }; });
  await settled(page); await page.getByRole('button', { name: 'Colocar primeira pessoa', exact: true }).click();
  await page.getByRole('button', { name: '+1 pessoa', exact: true }).click();
  await page.getByRole('button', { name: 'Concluir', exact: true }).click();
  await expect(page.getByLabel('Editor visual da fila')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar planta', exact: true }).click();
  await page.getByRole('button', { name: 'Nomear e salvar', exact: true }).click();
  await expect(page.getByText(/Medida com a câmera/)).toBeVisible();
  await page.getByLabel('Nome do projeto', { exact: true }).fill(`E2E câmera ${info.project.name}`);
  const response = page.waitForResponse((r) => r.url().endsWith('/api/projects') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Salvar projeto', exact: true }).click();
  const saved = await response; expect(saved.status()).toBe(201);
  const project = await saved.json(); expect(project.scene.environment.measurement.source).toBe('webxr');
  expect(project.scene.queue.personIds).toHaveLength(2); expect(project.scene.posts).toHaveLength(1);
  expect(project.scene).not.toHaveProperty('sessionToProject');
  expect(errors).toEqual([]);
});

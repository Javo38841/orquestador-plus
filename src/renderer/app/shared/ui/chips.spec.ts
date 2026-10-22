import { type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { TRANSLATIONS } from '../../i18n/transloco-loader';
import { BugStatusBadge } from './bug-status-badge';
import { OriginBadge } from './origin-badge';
import { ProjectChip } from './project-chip';
import { RepeatChip } from './repeat-chip';
import { SeverityBadge } from './severity-badge';
import { SnippetTypeBadge } from './snippet-type-badge';
import { TagChip } from './tag-chip';

async function render<T>(component: Type<T>, inputs: Record<string, unknown>) {
  await TestBed.configureTestingModule({
    imports: [
      component,
      TranslocoTestingModule.forRoot({
        langs: TRANSLATIONS,
        translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        preloadLangs: true,
      }),
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(component);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  fixture.detectChanges();
  const el = (fixture.nativeElement as HTMLElement).firstElementChild as HTMLElement;
  return { el, text: el.textContent!.replace(/\s+/g, ' ').trim() };
}

describe('chips and badges', () => {
  it('CP-N17-01: the project chip shows the name in project blue', async () => {
    const { el, text } = await render(ProjectChip, { name: 'Orquestador' });
    expect(text).toBe('Orquestador');
    expect(el.classList).toContain('text-project-ink');
    expect(el.classList).toContain('border-project');
  });

  it('CP-N17-02: the project chip without project shows "Suelta" in gray with a border', async () => {
    const { el, text } = await render(ProjectChip, { name: null });
    expect(text).toBe('Suelta');
    expect(el.classList).toContain('text-muted');
    expect(el.classList).toContain('border');
    expect(el.classList).not.toContain('text-project-ink');
  });

  it('CP-N17-03: the tag chip shows #bug in gray monospace', async () => {
    const { el, text } = await render(TagChip, { tag: 'bug' });
    expect(text).toBe('#bug');
    expect(el.classList).toContain('font-mono');
    expect(el.classList).toContain('text-muted');
  });

  it('CP-N17-04: the repeat chip shows ↻ and the text in violet', async () => {
    const { el, text } = await render(RepeatChip, { label: 'Semanal · domingo' });
    expect(text).toBe('↻ Semanal · domingo');
    expect(el.classList).toContain('text-repeat-ink');
    expect(el.classList).toContain('border-repeat');
  });

  it('CP-N17-05: the origin badge "Portal" is amber', async () => {
    const { el, text } = await render(OriginBadge, { label: 'Portal' });
    expect(text).toBe('Portal');
    expect(el.classList).toContain('text-warn');
  });

  it('CP-N17-06: severity high is red, medium amber and low blue', async () => {
    const high = await render(SeverityBadge, { severity: 'high' });
    expect(high.text).toBe('Alta');
    expect(high.el.classList).toContain('border-danger');
    TestBed.resetTestingModule();
    const medium = await render(SeverityBadge, { severity: 'medium' });
    expect(medium.text).toBe('Media');
    expect(medium.el.classList).toContain('text-warn');
    TestBed.resetTestingModule();
    const low = await render(SeverityBadge, { severity: 'low' });
    expect(low.text).toBe('Baja');
    expect(low.el.classList).toContain('border-project');
  });

  it('CP-N17-07: each bug status has its own color variant and Spanish text', async () => {
    const seen = new Map<string, string>();
    for (const status of ['new', 'analysis', 'resolved', 'verified'] as const) {
      TestBed.resetTestingModule();
      const { el, text } = await render(BugStatusBadge, { status });
      seen.set(text, el.className);
    }
    expect([...seen.keys()]).toEqual(['Nuevo', 'En análisis', 'Resuelto', 'Verificado']);
    expect(new Set(seen.values()).size).toBe(4);
  });

  it('CP-N17-08: SQL snippets are blue and commands violet', async () => {
    const sql = await render(SnippetTypeBadge, { type: 'sql' });
    expect(sql.text).toBe('SQL');
    expect(sql.el.classList).toContain('text-project-ink');
    TestBed.resetTestingModule();
    const command = await render(SnippetTypeBadge, { type: 'command' });
    expect(command.text).toBe('Comando');
    expect(command.el.classList).toContain('text-repeat-ink');
  });
});

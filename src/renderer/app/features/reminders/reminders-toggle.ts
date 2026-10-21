import { Component, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { DESKTOP_API } from '../../core/desktop-api';

/** Global switch for task reminder notifications (RF-18), persisted by main. */
@Component({
  selector: 'app-reminders-toggle',
  imports: [TranslocoPipe],
  template: `
    <label class="flex items-center gap-2 text-sm text-muted">
      <input
        type="checkbox"
        data-testid="reminders-enabled"
        [checked]="enabled()"
        (change)="change($any($event.target).checked)"
      />
      {{ 'reminders.enabled' | transloco }}
    </label>
  `,
})
export class RemindersToggle implements OnInit {
  private readonly api = inject(DESKTOP_API);
  protected readonly enabled = signal(true);

  async ngOnInit(): Promise<void> {
    if (this.api) this.enabled.set(await this.api.getRemindersEnabled());
  }

  protected async change(value: boolean): Promise<void> {
    this.enabled.set(value);
    if (this.api) this.enabled.set(await this.api.setRemindersEnabled(value));
  }
}

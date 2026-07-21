import { Component, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Observable, BehaviorSubject, combineLatest, map } from 'rxjs';
import { NavTabsComponent } from '../../components/nav-tabs/nav-tabs.component';
import { ExpenseService } from '../../services/expense.service';
import { FormattedExpense } from '../../models/expense.model';

@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe, RouterLink, FormsModule, NavTabsComponent],
  templateUrl: './expenses.component.html',
  styleUrl: './expenses.component.scss',
})
export class ExpensesComponent {
  private route = inject(ActivatedRoute);
  protected expenseService = inject(ExpenseService);

  // Filter state subjects
  protected presetDate$ = new BehaviorSubject<string>('all');
  protected startDate$ = new BehaviorSubject<string>('');
  protected endDate$ = new BehaviorSubject<string>('');
  protected selectedPaymentMethod$ = new BehaviorSubject<string>('');

  // Component local model bindings
  selectedPreset = 'all';
  customStart = '';
  customEnd = '';
  selectedPaymentMethod = '';

  // Payment methods for dropdown
  paymentMethods$ = this.expenseService.paymentMethods$;

  private categoryKey$ = this.route.queryParams.pipe(
    map((params) => params['category'] as string | undefined),
  );

  // Main filtered stream
  filteredExpenses$: Observable<FormattedExpense[]> = combineLatest([
    this.expenseService.getFormattedExpenses(),
    this.categoryKey$,
    this.presetDate$,
    this.startDate$,
    this.endDate$,
    this.selectedPaymentMethod$,
  ]).pipe(
    map(([expenses, categoryKey, preset, startStr, endStr, paymentKey]) => {
      let result = expenses;

      // 1. Filter by Category
      if (categoryKey) {
        result = result.filter((e) => e.categoryKey === categoryKey);
      }

      // 2. Filter by Payment Method
      if (paymentKey) {
        result = result.filter((e) => {
          const keys: string[] = (e as any).paymentMethodKeys || e.paymentMethods || [];
          return keys.includes(paymentKey);
        });
      }

      // 3. Filter by Date Range / Preset
      const range = this.calculateDateRange(preset, startStr, endStr);
      if (range.start !== null || range.end !== null) {
        result = result.filter((e) => {
          const createdTime = new Date(e.created).getTime();
          if (range.start !== null && createdTime < range.start) return false;
          if (range.end !== null && createdTime > range.end) return false;
          return true;
        });
      }

      return result;
    }),
  );

  // Total expense derived from filtered list
  totalExpenseAmount$: Observable<number> = this.filteredExpenses$.pipe(
    map((list) => list.reduce((sum, item) => sum + (item.amount || 0), 0)),
  );

  selectedCategory$: Observable<{ key: string; name: string } | null> = combineLatest([
    this.categoryKey$,
    this.expenseService.categories$,
  ]).pipe(
    map(([key, categories]) => {
      if (!key) return null;
      const match = categories.find((c) => c.key === key);
      return {
        key,
        name: match?.categoryName ?? 'Selected Category',
      };
    }),
  );

  // Filter control handlers
  onPresetChange(preset: string): void {
    this.selectedPreset = preset;
    this.presetDate$.next(preset);

    if (preset !== 'custom') {
      this.customStart = '';
      this.customEnd = '';
      this.startDate$.next('');
      this.endDate$.next('');
    }
  }

  onCustomDateChange(): void {
    this.selectedPreset = 'custom';
    this.presetDate$.next('custom');
    this.startDate$.next(this.customStart);
    this.endDate$.next(this.customEnd);
  }

  onPaymentMethodChange(key: string): void {
    this.selectedPaymentMethod = key;
    this.selectedPaymentMethod$.next(key);
  }

  resetFilters(): void {
    this.selectedPreset = 'all';
    this.customStart = '';
    this.customEnd = '';
    this.selectedPaymentMethod = '';

    this.presetDate$.next('all');
    this.startDate$.next('');
    this.endDate$.next('');
    this.selectedPaymentMethod$.next('');
  }

  // Helper date calculator
  private calculateDateRange(
    preset: string,
    startStr: string,
    endStr: string,
  ): { start: number | null; end: number | null } {
    const now = new Date();

    switch (preset) {
      case 'today': {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        return { start: start.getTime(), end: end.getTime() };
      }
      case 'this_month': {
        const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        return { start: start.getTime(), end: end.getTime() };
      }
      case 'last_month': {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        return { start: start.getTime(), end: end.getTime() };
      }
      case 'this_year': {
        const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        return { start: start.getTime(), end: end.getTime() };
      }
      case 'custom': {
        const start = startStr ? new Date(`${startStr}T00:00:00`).getTime() : null;
        const end = endStr ? new Date(`${endStr}T23:59:59`).getTime() : null;
        return { start, end };
      }
      default:
        return { start: null, end: null };
    }
  }
}

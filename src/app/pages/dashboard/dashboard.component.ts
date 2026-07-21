import { Component, inject, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule, CurrencyPipe, AsyncPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Observable, combineLatest, Subscription, map } from 'rxjs';
import { Chart, registerables } from 'chart.js';
import { NavTabsComponent } from '../../components/nav-tabs/nav-tabs.component';
import { ExpenseService } from '../../services/expense.service';
import { FormattedExpense, ExpenseCategory, PaymentMethod } from '../../models/expense.model';

Chart.register(...registerables);

export interface CategoryBreakdown {
  key: string;
  name: string;
  amount: number;
  percentage: number;
}

export type ChartType = 'monthly' | 'payment' | 'dayOfWeek' | 'vendors';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, AsyncPipe, NavTabsComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements AfterViewInit, OnDestroy {
  private expenseService = inject(ExpenseService);
  private sub = new Subscription();

  // Cached data for modal re-rendering
  private latestExpenses: FormattedExpense[] = [];
  private latestCategories: ExpenseCategory[] = [];
  private latestPaymentMethods: PaymentMethod[] = [];

  // Modal State
  public selectedChartType: ChartType | null = null;
  public selectedChartTitle = '';

  // Streams
  public expenses$: Observable<FormattedExpense[]> = this.expenseService.getFormattedExpenses();

  public totalSpent$: Observable<number> = this.expenses$.pipe(
    map((list) => list.reduce((sum, item) => sum + (item.amount || 0), 0)),
  );

  public totalCount$: Observable<number> = this.expenses$.pipe(map((list) => list.length));

  public currentMonthSpent$: Observable<number> = this.expenses$.pipe(
    map((list) => {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      return list
        .filter((item) => {
          const itemDate = new Date(item.created);
          return itemDate.getMonth() === currentMonth && itemDate.getFullYear() === currentYear;
        })
        .reduce((sum, item) => sum + (item.amount || 0), 0);
    }),
  );

  // Category Breakdown Stream (Percentage List)
  public categoryBreakdown$: Observable<CategoryBreakdown[]> = combineLatest([
    this.expenseService.categories$,
    this.expenses$,
    this.totalSpent$,
  ]).pipe(
    map(([categories, expenses, totalSpent]) => {
      return categories
        .map((cat) => {
          const catAmount = expenses
            .filter((e) => e.categoryKey === cat.key)
            .reduce((sum, e) => sum + (e.amount || 0), 0);

          const percentage = totalSpent > 0 ? (catAmount / totalSpent) * 100 : 0;

          return {
            key: cat.key,
            name: cat.categoryName,
            amount: catAmount,
            percentage: Math.round(percentage),
          };
        })
        .sort((a, b) => b.amount - a.amount);
    }),
  );

  // Dashboard Canvas References
  @ViewChild('monthlyCanvas') monthlyCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('paymentCanvas') paymentCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('dayOfWeekCanvas') dayOfWeekCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('vendorsCanvas') vendorsCanvas!: ElementRef<HTMLCanvasElement>;

  // Modal Canvas Reference
  @ViewChild('modalCanvas') modalCanvas?: ElementRef<HTMLCanvasElement>;

  // Chart Instances
  private monthlyChart?: Chart;
  private paymentChart?: Chart;
  private dayOfWeekChart?: Chart;
  private vendorsChart?: Chart;
  private modalChartInstance?: Chart;

  ngAfterViewInit(): void {
    this.sub.add(
      combineLatest([
        this.expenses$,
        this.expenseService.categories$,
        this.expenseService.paymentMethods$,
      ]).subscribe(([expenses, categories, paymentMethods]) => {
        if (!expenses || expenses.length === 0) return;

        this.latestExpenses = expenses;
        this.latestCategories = categories;
        this.latestPaymentMethods = paymentMethods;

        this.renderMonthlyChart(expenses);
        this.renderPaymentChart(expenses, paymentMethods);
        this.renderDayOfWeekChart(expenses);
        this.renderVendorsChart(expenses);
      }),
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    this.destroyCharts();
  }

  private destroyCharts(): void {
    this.monthlyChart?.destroy();
    this.paymentChart?.destroy();
    this.dayOfWeekChart?.destroy();
    this.vendorsChart?.destroy();
    this.modalChartInstance?.destroy();
  }

  // --- Modal Click Handling ---

  public openEnlargedChart(type: ChartType, title: string): void {
    this.selectedChartType = type;
    this.selectedChartTitle = title;

    setTimeout(() => {
      if (this.modalCanvas) {
        this.renderModalChart(type);
      }
    }, 0);
  }

  public closeModal(): void {
    this.selectedChartType = null;
    this.selectedChartTitle = '';
    this.modalChartInstance?.destroy();
  }

  private renderModalChart(type: ChartType): void {
    if (!this.modalCanvas) return;
    this.modalChartInstance?.destroy();

    const canvas = this.modalCanvas.nativeElement;

    switch (type) {
      case 'monthly':
        this.modalChartInstance = this.createMonthlyChartConfig(canvas, this.latestExpenses);
        break;
      case 'payment':
        this.modalChartInstance = this.createPaymentChartConfig(
          canvas,
          this.latestExpenses,
          this.latestPaymentMethods,
        );
        break;
      case 'dayOfWeek':
        this.modalChartInstance = this.createDayOfWeekChartConfig(canvas, this.latestExpenses);
        break;
      case 'vendors':
        this.modalChartInstance = this.createVendorsChartConfig(canvas, this.latestExpenses);
        break;
    }
  }

  // --- Chart Builders ---

  private renderMonthlyChart(expenses: FormattedExpense[]): void {
    if (!this.monthlyCanvas) return;
    this.monthlyChart?.destroy();
    this.monthlyChart = this.createMonthlyChartConfig(this.monthlyCanvas.nativeElement, expenses);
  }

  private createMonthlyChartConfig(canvas: HTMLCanvasElement, expenses: FormattedExpense[]): Chart {
    const monthlyMap = new Map<string, number>();

    expenses.forEach((e) => {
      const d = new Date(e.created);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap.set(key, (monthlyMap.get(key) || 0) + (e.amount || 0));
    });

    const sortedKeys = Array.from(monthlyMap.keys()).sort();
    const labels = sortedKeys.map((k) => {
      const [year, month] = k.split('-');
      return new Date(+year, +month - 1).toLocaleDateString('en-IN', {
        month: 'short',
        year: '2-digit',
      });
    });
    const data = sortedKeys.map((k) => monthlyMap.get(k) || 0);

    return new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Total Spend (₹)',
            data,
            borderColor: '#0284c7',
            backgroundColor: 'rgba(2, 132, 199, 0.1)',
            fill: true,
            tension: 0.35,
            pointRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (val) => `₹${Number(val).toLocaleString('en-IN')}` },
          },
        },
      },
    });
  }

  private renderPaymentChart(expenses: FormattedExpense[], paymentMethods: PaymentMethod[]): void {
    if (!this.paymentCanvas) return;
    this.paymentChart?.destroy();
    this.paymentChart = this.createPaymentChartConfig(
      this.paymentCanvas.nativeElement,
      expenses,
      paymentMethods,
    );
  }

  private createPaymentChartConfig(
    canvas: HTMLCanvasElement,
    expenses: FormattedExpense[],
    paymentMethods: PaymentMethod[],
  ): Chart {
    const methodMap = new Map<string, number>();
    paymentMethods.forEach((p) => methodMap.set(p.paymentMethod, 0));

    expenses.forEach((e) => {
      (e.paymentMethodNames || []).forEach((name) => {
        methodMap.set(name, (methodMap.get(name) || 0) + (e.amount || 0));
      });
    });

    return new Chart(canvas, {
      type: 'bar',
      data: {
        labels: Array.from(methodMap.keys()),
        datasets: [
          {
            label: 'Spent via Payment Method (₹)',
            data: Array.from(methodMap.values()),
            backgroundColor: '#3b82f6',
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (val) => `₹${Number(val).toLocaleString('en-IN')}` },
          },
        },
      },
    });
  }

  private renderDayOfWeekChart(expenses: FormattedExpense[]): void {
    if (!this.dayOfWeekCanvas) return;
    this.dayOfWeekChart?.destroy();
    this.dayOfWeekChart = this.createDayOfWeekChartConfig(
      this.dayOfWeekCanvas.nativeElement,
      expenses,
    );
  }

  private createDayOfWeekChartConfig(
    canvas: HTMLCanvasElement,
    expenses: FormattedExpense[],
  ): Chart {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const totals = new Array(7).fill(0);

    expenses.forEach((e) => {
      const d = new Date(e.created);
      const dayIdx = (d.getDay() + 6) % 7;
      totals[dayIdx] += e.amount || 0;
    });

    return new Chart(canvas, {
      type: 'bar',
      data: {
        labels: days,
        datasets: [
          {
            label: 'Spending by Day (₹)',
            data: totals,
            backgroundColor: totals.map((_, i) => (i >= 5 ? '#f59e0b' : '#0284c7')),
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (val) => `₹${Number(val).toLocaleString('en-IN')}` },
          },
        },
      },
    });
  }

  private renderVendorsChart(expenses: FormattedExpense[]): void {
    if (!this.vendorsCanvas) return;
    this.vendorsChart?.destroy();
    this.vendorsChart = this.createVendorsChartConfig(this.vendorsCanvas.nativeElement, expenses);
  }

  private createVendorsChartConfig(canvas: HTMLCanvasElement, expenses: FormattedExpense[]): Chart {
    const vendorMap = new Map<string, number>();

    expenses.forEach((e) => {
      if (e.spentOn && e.spentOn.trim() !== '') {
        const key = e.spentOn.trim();
        vendorMap.set(key, (vendorMap.get(key) || 0) + (e.amount || 0));
      }
    });

    const sorted = Array.from(vendorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return new Chart(canvas, {
      type: 'bar',
      data: {
        labels: sorted.map((item) => item[0]),
        datasets: [
          {
            label: 'Top Vendors (₹)',
            data: sorted.map((item) => item[1]),
            backgroundColor: '#10b981',
            borderRadius: 6,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            beginAtZero: true,
            ticks: { callback: (val) => `₹${Number(val).toLocaleString('en-IN')}` },
          },
        },
      },
    });
  }
}

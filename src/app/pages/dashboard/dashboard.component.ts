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

export type ChartType =
  | 'monthly'
  | 'payment'
  | 'dayOfWeek'
  | 'vendors'
  | 'currentMonthCategory'
  | 'financialYear'
  | 'categoryMonthly';

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

  // Financial Year Filter State
  public selectedFinancialYear = '';
  public availableFinancialYears: string[] = [];

  // Category Monthly Filter State
  public selectedCategoryMonthlyYear = '';
  public selectedCategoryMonthlyCategory = '';
  public availableCategoryMonthlyYears: string[] = [];

  // Streams
  public categories$: Observable<ExpenseCategory[]> = this.expenseService.categories$;
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
    this.categories$,
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
  @ViewChild('categoryMonthCanvas') categoryMonthCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('fyCanvas') fyCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('categoryMonthlyCanvas') categoryMonthlyCanvas!: ElementRef<HTMLCanvasElement>;

  // Modal Canvas Reference
  @ViewChild('modalCanvas') modalCanvas?: ElementRef<HTMLCanvasElement>;

  // Chart Instances
  private monthlyChart?: Chart;
  private paymentChart?: Chart;
  private dayOfWeekChart?: Chart;
  private vendorsChart?: Chart;
  private categoryMonthChart?: Chart;
  private fyChart?: Chart;
  private categoryMonthlyChart?: Chart;
  private modalChartInstance?: Chart;

  ngAfterViewInit(): void {
    this.sub.add(
      combineLatest([
        this.expenses$,
        this.categories$,
        this.expenseService.paymentMethods$,
      ]).subscribe(([expenses, categories, paymentMethods]) => {
        if (!expenses || expenses.length === 0) return;

        this.latestExpenses = expenses;
        this.latestCategories = categories;
        this.latestPaymentMethods = paymentMethods;

        // Initialize Category Monthly defaults
        if (!this.selectedCategoryMonthlyCategory && categories.length > 0) {
          this.selectedCategoryMonthlyCategory = categories[0].key;
        }

        this.computeAvailableFinancialYears(expenses);
        this.computeAvailableCategoryMonthlyYears(expenses);

        this.renderMonthlyChart(expenses);
        this.renderPaymentChart(expenses, paymentMethods);
        this.renderDayOfWeekChart(expenses);
        this.renderVendorsChart(expenses);
        this.renderCategoryMonthChart(expenses, categories);
        this.renderFYChart(expenses);
        this.renderCategoryMonthlyChart(expenses, categories);
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
    this.categoryMonthChart?.destroy();
    this.fyChart?.destroy();
    this.categoryMonthlyChart?.destroy();
    this.modalChartInstance?.destroy();
  }

  // --- Financial Year Dropdown Helpers ---

  private getFinancialYear(date: Date): string {
    const year = date.getFullYear();
    const month = date.getMonth(); // 0 = Jan, 3 = Apr
    const startYear = month >= 3 ? year : year - 1;
    const endYear = startYear + 1;
    return `FY ${startYear}-${String(endYear % 100).padStart(2, '0')}`;
  }

  private computeAvailableFinancialYears(expenses: FormattedExpense[]): void {
    const fySet = new Set<string>();
    fySet.add(this.getFinancialYear(new Date()));

    expenses.forEach((e) => {
      if (e.created) {
        fySet.add(this.getFinancialYear(new Date(e.created)));
      }
    });

    this.availableFinancialYears = Array.from(fySet).sort().reverse();

    if (!this.selectedFinancialYear && this.availableFinancialYears.length > 0) {
      this.selectedFinancialYear = this.availableFinancialYears[0];
    }
  }

  public onFinancialYearChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.selectedFinancialYear = select.value;
    if (this.latestExpenses.length > 0) {
      this.renderFYChart(this.latestExpenses);
    }
  }

  // --- Monthly Category Filter Helpers ---

  private computeAvailableCategoryMonthlyYears(expenses: FormattedExpense[]): void {
    const yearSet = new Set<string>();
    yearSet.add(new Date().getFullYear().toString());

    expenses.forEach((e) => {
      if (e.created) {
        yearSet.add(new Date(e.created).getFullYear().toString());
      }
    });

    this.availableCategoryMonthlyYears = Array.from(yearSet).sort().reverse();

    if (!this.selectedCategoryMonthlyYear && this.availableCategoryMonthlyYears.length > 0) {
      this.selectedCategoryMonthlyYear = this.availableCategoryMonthlyYears[0];
    }
  }

  public onCategoryMonthlyYearChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.selectedCategoryMonthlyYear = select.value;
    if (this.latestExpenses.length > 0) {
      this.renderCategoryMonthlyChart(this.latestExpenses, this.latestCategories);
    }
  }

  public onCategoryMonthlyCategoryChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.selectedCategoryMonthlyCategory = select.value;
    if (this.latestExpenses.length > 0) {
      this.renderCategoryMonthlyChart(this.latestExpenses, this.latestCategories);
    }
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
      case 'currentMonthCategory':
        this.modalChartInstance = this.createCategoryMonthChartConfig(
          canvas,
          this.latestExpenses,
          this.latestCategories,
        );
        break;
      case 'financialYear':
        this.modalChartInstance = this.createFYChartConfig(
          canvas,
          this.latestExpenses,
          this.selectedFinancialYear,
        );
        break;
      case 'categoryMonthly':
        this.modalChartInstance = this.createCategoryMonthlyChartConfig(
          canvas,
          this.latestExpenses,
          this.latestCategories,
          this.selectedCategoryMonthlyYear,
          this.selectedCategoryMonthlyCategory,
        );
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

  private renderCategoryMonthChart(
    expenses: FormattedExpense[],
    categories: ExpenseCategory[],
  ): void {
    if (!this.categoryMonthCanvas) return;
    this.categoryMonthChart?.destroy();
    this.categoryMonthChart = this.createCategoryMonthChartConfig(
      this.categoryMonthCanvas.nativeElement,
      expenses,
      categories,
    );
  }

  private createCategoryMonthChartConfig(
    canvas: HTMLCanvasElement,
    expenses: FormattedExpense[],
    categories: ExpenseCategory[],
  ): Chart {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const categoryMap = new Map<string, number>();
    categories.forEach((c) => categoryMap.set(c.categoryName, 0));

    expenses.forEach((e) => {
      const itemDate = new Date(e.created);
      if (itemDate.getMonth() === currentMonth && itemDate.getFullYear() === currentYear) {
        const cat = categories.find((c) => c.key === e.categoryKey);
        const name = cat ? cat.categoryName : e.categoryKey || 'Uncategorized';
        categoryMap.set(name, (categoryMap.get(name) || 0) + (e.amount || 0));
      }
    });

    const labels: string[] = [];
    const data: number[] = [];
    categoryMap.forEach((val, key) => {
      if (val > 0) {
        labels.push(key);
        data.push(val);
      }
    });

    const palette = [
      '#0284c7',
      '#10b981',
      '#f59e0b',
      '#8b5cf6',
      '#ec4899',
      '#06b6d4',
      '#f97316',
      '#64748b',
    ];

    return new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: palette.slice(0, labels.length),
            borderWidth: 2,
            borderColor: '#ffffff',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              font: { size: 11 },
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ₹${Number(ctx.raw).toLocaleString('en-IN')}`,
            },
          },
        },
      },
    });
  }

  // --- Financial Year Horizontal Bar Chart ---

  private renderFYChart(expenses: FormattedExpense[]): void {
    if (!this.fyCanvas) return;
    this.fyChart?.destroy();
    this.fyChart = this.createFYChartConfig(
      this.fyCanvas.nativeElement,
      expenses,
      this.selectedFinancialYear,
    );
  }

  private createFYChartConfig(
    canvas: HTMLCanvasElement,
    expenses: FormattedExpense[],
    selectedFY: string,
  ): Chart {
    const startYear =
      parseInt(selectedFY.replace('FY ', '').split('-')[0], 10) || new Date().getFullYear();

    const fyMonths = [
      { name: 'Apr', year: startYear, mIdx: 3 },
      { name: 'May', year: startYear, mIdx: 4 },
      { name: 'Jun', year: startYear, mIdx: 5 },
      { name: 'Jul', year: startYear, mIdx: 6 },
      { name: 'Aug', year: startYear, mIdx: 7 },
      { name: 'Sep', year: startYear, mIdx: 8 },
      { name: 'Oct', year: startYear, mIdx: 9 },
      { name: 'Nov', year: startYear, mIdx: 10 },
      { name: 'Dec', year: startYear, mIdx: 11 },
      { name: 'Jan', year: startYear + 1, mIdx: 0 },
      { name: 'Feb', year: startYear + 1, mIdx: 1 },
      { name: 'Mar', year: startYear + 1, mIdx: 2 },
    ];

    const monthlyTotals = new Array(12).fill(0);

    expenses.forEach((e) => {
      const d = new Date(e.created);
      const y = d.getFullYear();
      const m = d.getMonth();

      const foundIdx = fyMonths.findIndex((item) => item.year === y && item.mIdx === m);
      if (foundIdx !== -1) {
        monthlyTotals[foundIdx] += e.amount || 0;
      }
    });

    return new Chart(canvas, {
      type: 'bar',
      data: {
        labels: fyMonths.map((item) => `${item.name} '${String(item.year).slice(-2)}`),
        datasets: [
          {
            label: `Monthly Spend (${selectedFY}) (₹)`,
            data: monthlyTotals,
            backgroundColor: '#6366f1',
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

  // --- Monthly Category Spending Chart ---

  private renderCategoryMonthlyChart(
    expenses: FormattedExpense[],
    categories: ExpenseCategory[],
  ): void {
    if (!this.categoryMonthlyCanvas) return;
    this.categoryMonthlyChart?.destroy();
    this.categoryMonthlyChart = this.createCategoryMonthlyChartConfig(
      this.categoryMonthlyCanvas.nativeElement,
      expenses,
      categories,
      this.selectedCategoryMonthlyYear,
      this.selectedCategoryMonthlyCategory,
    );
  }

  private createCategoryMonthlyChartConfig(
    canvas: HTMLCanvasElement,
    expenses: FormattedExpense[],
    categories: ExpenseCategory[],
    selectedYear: string,
    selectedCatKey: string,
  ): Chart {
    const yearNum = parseInt(selectedYear, 10) || new Date().getFullYear();
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const monthlyTotals = new Array(12).fill(0);

    expenses.forEach((e) => {
      const d = new Date(e.created);
      if (d.getFullYear() === yearNum && e.categoryKey === selectedCatKey) {
        monthlyTotals[d.getMonth()] += e.amount || 0;
      }
    });

    const cat = categories.find((c) => c.key === selectedCatKey);
    const catName = cat ? cat.categoryName : selectedCatKey || 'Selected Category';

    return new Chart(canvas, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          {
            label: `${catName} Spend (${selectedYear}) (₹)`,
            data: monthlyTotals,
            backgroundColor: '#0284c7',
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
}

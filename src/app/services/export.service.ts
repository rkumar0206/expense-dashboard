import { Injectable, inject } from '@angular/core';
import { combineLatest, firstValueFrom } from 'rxjs';
import { ExpenseService } from './expense.service';
import { FormattedExpense, ExpenseCategory } from '../models/expense.model';

export interface ExportCategory {
  name: string;
  description: string;
  imageUrl: string;
  isSynced: boolean;
  created: string;
  modified: string;
}

export interface ExportExpense {
  spentOn: string;
  amount: number;
  categoryName: string;
  paymentMethods: string[];
  isSynced: boolean;
  created: string;
  modified: string;
}

export interface ExportPayload {
  version: string;
  categories: ExportCategory[];
  expenses: ExportExpense[];
}

@Injectable({
  providedIn: 'root',
})
export class ExportService {
  private expenseService = inject(ExpenseService);

  public async exportUserData(userId: string = '1_9862365999765812418'): Promise<void> {
    // 1. Fetch current data streams
    const [expenses, categories] = await firstValueFrom(
      combineLatest([this.expenseService.getFormattedExpenses(), this.expenseService.categories$]),
    );

    // 2. Map data to export payload format
    const payload: ExportPayload = {
      version: '1.0',
      categories: this.mapCategories(categories),
      expenses: this.mapExpenses(expenses, categories),
    };

    // 3. Stringify & Compress to Gzip
    const jsonString = JSON.stringify(payload, null, 2);
    const compressedBlob = await this.compressGzip(jsonString);

    // 4. Download as user_export_<userId>.json.gz
    const fileName = `user_export_${userId}.json.gz`;
    this.downloadFile(compressedBlob, fileName);
  }

  private mapCategories(categories: ExpenseCategory[]): ExportCategory[] {
    const defaultDate = new Date().toISOString();

    return categories.map((cat) => ({
      name: cat.categoryName || '',
      description: cat.categoryDescription || '',
      imageUrl: cat.imageUrl || '',
      isSynced: cat.synced ?? true,
      created: cat.created ? new Date(cat.created).toISOString() : defaultDate,
      modified: cat.modified ? new Date(cat.modified).toISOString() : defaultDate,
    }));
  }

  private mapExpenses(
    expenses: FormattedExpense[],
    categories: ExpenseCategory[],
  ): ExportExpense[] {
    const categoryMap = new Map<string, string>();
    categories.forEach((c) => categoryMap.set(c.key, c.categoryName));

    const defaultDate = new Date().toISOString();

    return expenses.map((exp) => ({
      spentOn: exp.spentOn || '',
      amount: exp.amount || 0,
      categoryName: categoryMap.get(exp.categoryKey) || exp.categoryKey || 'Others',
      paymentMethods: exp.paymentMethodNames || [],
      isSynced: exp.synced ?? true,
      created: exp.created ? new Date(exp.created).toISOString() : defaultDate,
      modified: exp.modified ? new Date(exp.modified).toISOString() : defaultDate,
    }));
  }

  private async compressGzip(jsonString: string): Promise<Blob> {
    const byteArray = new TextEncoder().encode(jsonString);
    const stream = new Blob([byteArray]).stream();
    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));

    const response = new Response(compressedStream);
    const blob = await response.blob();
    return new Blob([blob], { type: 'application/gzip' });
  }

  private downloadFile(blob: Blob, fileName: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }
}

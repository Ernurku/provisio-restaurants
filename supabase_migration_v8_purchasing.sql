-- ============================================
-- PROVISIO migration: Purchasing (Закупки) tab
-- ============================================
-- Adds the "expected daily sales" field used by the Закупки calculator.
-- Safe to re-run (IF NOT EXISTS). RLS on menu_items already protects this column.
-- Run in Supabase SQL Editor.
-- ============================================

-- expected_daily_sales = сырое число, которое ввёл пользователь (не нормализованное)
ALTER TABLE menu_items
ADD COLUMN IF NOT EXISTS expected_daily_sales NUMERIC DEFAULT 0;

-- expected_sales_period = период этого числа: 'day' | 'week' | 'month'
-- Расчёт нормализует число к дневной ставке: week ÷ 7, month ÷ 30, day как есть.
ALTER TABLE menu_items
ADD COLUMN IF NOT EXISTS expected_sales_period TEXT DEFAULT 'day';

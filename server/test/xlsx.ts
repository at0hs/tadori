import ExcelJS from "exceljs";

// 出力した .xlsx を読み直す（Excel 出力のテスト用）。
// ExcelJS の型の Buffer は Node の Buffer と ArrayBuffer を合わせたものになっていて、どちらも渡せないので変換する。
export async function readXlsx(data: ArrayBuffer | Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  type Input = Parameters<typeof wb.xlsx.load>[0];
  await wb.xlsx.load(Buffer.from(data as Uint8Array) as unknown as Input);
  return wb;
}

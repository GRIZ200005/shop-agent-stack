export type Side = "portal" | "admin";
export class ApiError extends Error {
  constructor(
    message: string,
    public code: number,
  ) {
    super(message);
  }
}
export const token = (side: Side) =>
  sessionStorage.getItem(`shop_agent_stack_${side}`) || "";
export function saveToken(side: Side, value: string) {
  sessionStorage.setItem(`shop_agent_stack_${side}`, value);
}
export function clearToken(side: Side) {
  sessionStorage.removeItem(`shop_agent_stack_${side}`);
}
export async function api<T>(
  side: Side,
  path: string,
  body?: unknown,
  form = false,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (token(side)) headers.Authorization = token(side);
  if (body !== undefined)
    headers["Content-Type"] = form
      ? "application/x-www-form-urlencoded"
      : "application/json";
  const response = await fetch(`/api/${side}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body:
      body === undefined
        ? undefined
        : form
          ? new URLSearchParams(body as Record<string, string>)
          : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => {
    throw new ApiError("服务暂时不可用，请稍后重试", response.status);
  });
  if (data.code !== 200) {
    if (data.code === 401) {
      clearToken(side);
      if (location.pathname !== "/login")
        window.dispatchEvent(new Event("shop_agent_stack-session-expired"));
    }
    throw new ApiError(
      data.message || "操作未完成",
      data.code || response.status,
    );
  }
  return data.data as T;
}
export interface Product {
  id: number;
  name: string;
  price: number;
  productSn: string;
  brandName: string;
  productCategoryId: number;
  stock: number;
  pic?: string;
  productCategoryName?: string;
  subTitle?: string;
  description?: string;
  detailDesc?: string;
}
export interface Cart {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  price: number;
  productPic?: string;
}
export interface Order {
  id: number;
  orderSn: string;
  status: number;
  payAmount: number;
  createTime: string;
  orderItemList: {
    productName: string;
    productQuantity: number;
    productId: number;
    productPic?: string;
  }[];
}
export interface Sale {
  id: number;
  order_id: number;
  reason: string;
  amount: number;
  status: string;
  assignee_id: number | null;
  assignee_name?: string;
  decision_note?: string;
  refund_reference?: string;
  created_at: string;
  events?: { action: string; note: string; created_at: string }[];
}
export interface Policy {
  id: number;
  title: string;
  content: string;
  status: string;
  version: number;
  visibility?: string;
  index_status?: string;
  clause_count?: number;
  clauses?: { clause_no: number; content: string; content_hash: string }[];
}
export interface Staff {
  id: number;
  username: string;
  nick_name: string;
  role: "ADMIN" | "SERVICE";
}
export const money = (n: number) =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(
    n,
  );
export { date } from "./datetime";
export const saleLabels: Record<string, string> = {
  SUBMITTED: "待领取",
  CLAIMED: "人工处理中",
  REFUNDING: "模拟退款处理中",
  REFUND_REVIEW: "退款待核实",
  REFUNDED: "模拟退款完成",
  REJECTED: "已拒绝",
};

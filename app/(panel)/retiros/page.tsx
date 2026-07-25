import { redirect } from "next/navigation";

export default function WithdrawalsPage() {
  redirect("/solicitudes?tipo=retiro");
}

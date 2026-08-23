import { describe, expect, it } from "vitest";

import { getGoalIcon, sortGoalsByAllocationPercentage } from "@/components/finance/goalVisuals";

describe("goal visuals", () => {
  it("ordena os planos pelo maior percentual vigente", () => {
    const goals = [
      { id: "travel", name: "Viagem", goal_type: "travel" },
      { id: "emergency", name: "Reserva", goal_type: "emergency" },
      { id: "car", name: "Compra de carro", goal_type: "car" },
    ];
    const rules = [
      { goal_id: "travel", value_type: "percentage", value: 8 },
      { goal_id: "emergency", value_type: "percentage", value: 15 },
      { goal_id: "car", value_type: "percentage", value: 6 },
    ];

    expect(sortGoalsByAllocationPercentage(goals, rules).map((goal) => goal.id))
      .toEqual(["emergency", "travel", "car"]);
  });

  it("mantém planos sem percentual depois dos percentuais", () => {
    const goals = [
      { id: "fixed", name: "Valor fixo" },
      { id: "percentage", name: "Percentual" },
    ];
    const rules = [
      { goal_id: "fixed", value_type: "fixed", value: 500 },
      { goal_id: "percentage", value_type: "percentage", value: 1 },
    ];

    expect(sortGoalsByAllocationPercentage(goals, rules).map((goal) => goal.id))
      .toEqual(["percentage", "fixed"]);
  });

  it("reconhece ícones pelo tipo e pelo nome legado", () => {
    expect(getGoalIcon({ name: "Qualquer nome", goal_type: "travel" }))
      .toBe(getGoalIcon({ name: "Viagem dos sonhos" }));
    expect(getGoalIcon({ name: "Compra do carro" }))
      .not.toBe(getGoalIcon({ name: "Reserva de emergência" }));
  });
});

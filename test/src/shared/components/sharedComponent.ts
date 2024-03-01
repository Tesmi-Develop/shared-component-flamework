import { Component } from "@flamework/components";
import { SharedComponent } from "../../source/shared-component";
import { OnStart } from "@flamework/core";
import { RunService } from "@rbxts/services";

interface State {
	money: number;
}

@Component({
	tag: `${MoneyStorageComponent}`,
})
export class MoneyStorageComponent extends SharedComponent<State> implements OnStart {
	protected state: State = {
		money: 0,
	};

	public onStart() {
		if (RunService.IsServer()) {
			task.spawn(() => {
				while (task.wait(2)) {
					this.incrementMoney(1);
				}
			});
		}
	}

	private onChangedMoney(money: number) {
		print(`new money: ${money}`);
	}

	private incrementMoney(money: number) {
		return {
			...this.state,
			money: this.state.money + money,
		};
	}
}

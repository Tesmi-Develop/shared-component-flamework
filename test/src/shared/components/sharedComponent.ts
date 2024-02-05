import { Component } from "@flamework/components";
import { SharedComponent } from "../../source/shared-component";
import { OnStart } from "@flamework/core";
import { RunService } from "@rbxts/services";
import { Action } from "../../source/decorators/action";
import { SharedSubscribe } from "../../source/decorators/subscribe";

interface State {
	money: number;
}

@Component({
	tag: `${MoneyStorageComponent}1`,
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

	@SharedSubscribe("Client", (state) => state.money)
	private onChangedMoney(money: number) {
		print(`new money: ${money}`);
	}

	@Action()
	private incrementMoney(money: number) {
		return {
			...this.state,
			money: this.state.money + money,
		};
	}
}

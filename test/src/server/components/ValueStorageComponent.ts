import { Component } from "@flamework/components";
import { OnStart } from "@flamework/core";
import { ValueStorageComponent } from "shared/components/valueStorageComponent";
import { Action } from "../../source/decorators";
import { Players } from "@rbxts/services";

@Component({
	tag: "ValueStorageComponent",
})
export class ServerValueStorageComponent extends ValueStorageComponent implements OnStart {
	onStart(): void {
		task.spawn(() => {
			const instance = this.instance;
			let k = 0;
			while (task.wait(3)) {
				this.increment();
				k++;
			}
			this.destroy();
		});
	}

	public ResolveReplicationForPlayers() {
		return Players.GetPlayers()[0];
	}

	public destroy(): void {
		super.destroy();
	}

	@Action()
	private increment() {
		return {
			...this.state,
			value: this.state.value + 1,
		};
	}
}

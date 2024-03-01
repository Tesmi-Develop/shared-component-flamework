import { Component } from "@flamework/components";
import { OnStart } from "@flamework/core";
import { ValueStorageComponent, ValueStorageComponentPointer } from "shared/components/valueStorageComponent";
import { Players } from "@rbxts/services";

@Component({
	tag: "ValueStorageComponent",
})
export class ServerValueStorageComponent extends ValueStorageComponent implements OnStart {
	protected pointer = ValueStorageComponentPointer;

	onStart(): void {
		/*task.spawn(() => {
			const instance = this.instance;
			let k = 0;
			while (task.wait(3)) {
				this.increment();
				k++;
			}
			this.destroy();
		});*/

		this.Subscribe(
			(state) => state.value,
			(val) => print(`server value: ${val}`),
		);

		task.wait(6);
		this.Dispatch({
			value: 10,
			a: 6,
			b: 6,
		});
	}

	public ResolveReplicationForPlayers(player: Player) {
		return Players.GetPlayers()[0] === player;
	}

	public destroy(): void {
		super.destroy();
	}

	private increment() {
		return {
			...this.state,
			value: this.state.value + 1,
		};
	}
}

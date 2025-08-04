import { Component } from "@flamework/components";
import { OnStart } from "@flamework/core";
import { Action } from "@rbxts/shared-components-flamework";
import { ValueStorageComponent1 } from "shared/components/valueStorageComponent-1";

@Component({
	tag: "ValueStorageComponent1",
})
export class ServerValueStorageComponent extends ValueStorageComponent1 implements OnStart {
	public onStart() {
		task.spawn(() => {
			while (task.wait(3)) {
				this.setValue(this.state.value + 1);
				this.remotes.ping.Broadcast(this.state.value);
			}
		});

		this.remotes.pong.Connect((player, value) => {
			print(`Player ${player.Name} sent value ${value}`);
		});
	}

	public ResolveConnectionPermission(player: Player): boolean {
		const success = math.random() > 0.5;
		if (!success) {
			print(`Player ${player.Name} is not allowed to connect`);
		}
		return success;
	}

	@Action()
	private setValue(value: number) {
		return {
			...this.state,
			value,
		};
	}
}

import { Component } from "@flamework/components";
import { OnStart } from "@flamework/core";
import { Subscribe } from "@rbxts/shared-components-flamework";
import { ValueStorageComponent1 } from "shared/components/valueStorageComponent-1";

@Component({
	tag: "ValueStorageComponent1",
})
export class ClientValueStorageComponent extends ValueStorageComponent1 implements OnStart {
	onStart(): void {
		this.Subscribe((state) => {
			print(state);
		});

		this.remotes.ping.Connect((value) => {
			this.remotes.pong.Fire(value);
		});
	}

	@Subscribe((state) => state.value)
	private onIncrement(newValue: number) {
		print(`new value: ${newValue}`);
	}

	public OnConnected(): void {
		print("Connected");
	}

	public OnDisconnected(): void {
		print("Disconnected");
	}
}

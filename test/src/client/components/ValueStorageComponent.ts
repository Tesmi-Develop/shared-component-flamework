import { Component } from "@flamework/components";
import { ValueStorageComponent } from "shared/components/valueStorageComponent";
import { OnStart } from "@flamework/core";
import { Subscribe } from "@rbxts/reflex-class";

@Component({
	tag: "ValueStorageComponent",
})
export class ClientValueStorageComponent extends ValueStorageComponent implements OnStart {
	onStart() {
		print("Hello from client");
		this.remotes.IncrementByServer.Connect((amount: number) => {
			print(`incrementing by ${amount}`);
		});
		this.remotes.IncrementByClient.Fire(1);
		this.remotes.Increment(1).then(() => print("incremented"));
	}

	public destroy(): void {
		super.destroy();
		print("ClientValueStorageComponent destroyed");
	}

	@Subscribe((state) => state.value)
	private onIncrement(value: number) {
		print("incremented", value);
	}
}

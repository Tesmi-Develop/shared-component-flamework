import { Component } from "@flamework/components";
import { ValueStorageComponent, ValueStorageComponentPointer } from "shared/components/valueStorageComponent";
import { OnStart } from "@flamework/core";
import { remotes } from "../../remotes";

@Component({
	tag: "ValueStorageComponent",
})
export class ClientValueStorageComponent extends ValueStorageComponent implements OnStart {
	onStart(): void {
		this.Subscribe(
			(state) => state.value,
			(val) => print(`client value: ${val}`),
		);
	}

	public destroy(): void {
		super.destroy();
		print("client destroy");
	}

	private onIncrement(newValue: number) {
		print(`new value: ${newValue}`);
	}
}

@Component({
	tag: "ValueStorageComponent",
})
export class Client1ValueStorageComponent extends ValueStorageComponent implements OnStart {
	protected pointer = ValueStorageComponentPointer;

	onStart(): void {
		this.AttachDevTool();
		this.Subscribe(
			(state) => state.value,
			(val) => print(`client value: ${val}`),
		);

		task.wait(7);

		this.Dispatch({
			value: 2,
			a: 11,
			b: 11,
		});
	}
}

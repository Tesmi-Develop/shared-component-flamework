import { Component } from "@flamework/components";
import { OnStart } from "@flamework/core";
import { ValueStorageComponent, ValueStorageComponentPointer } from "shared/components/valueStorageComponent";

@Component({
	tag: "ValueStorageComponent",
})
export class ServerValueStorageComponent extends ValueStorageComponent implements OnStart {
	protected pointer = ValueStorageComponentPointer;

	onStart() {
		this.actions.Increment.OnRequest((player, amount) => {
			print(`server increment: ${amount}`, player);
		});
	}
}

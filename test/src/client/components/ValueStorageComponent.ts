import { Component } from "@flamework/components";
import { ValueStorageComponent } from "shared/components/valueStorageComponent";
import { OnStart } from "@flamework/core";

@Component({
	tag: "ValueStorageComponent",
})
export class ClientValueStorageComponent extends ValueStorageComponent implements OnStart {
	onStart(): void {
		this.actions.Increment(1);
	}
}

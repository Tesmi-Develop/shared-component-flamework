import { Controller, Modding, OnInit, Service } from "@flamework/core";
import { BroadcastAction } from "@rbxts/reflex";
import { remotes } from "../remotes";
import { SharedComponent } from "./shared-component";
import { IsClient, IsServer, logWarning } from "../utilities";
import { SharedComponentInfo } from "../types";
import { Components } from "@flamework/components";
import { Pointer } from "./pointer";
import {
	IsSharedComponentRemoteEvent,
	SharedRemoteEventClientToServer,
	SharedRemoteEventServerToClient,
} from "./shared-component-network/event";
import { ACTION_GUARD_FAILED, SharedRemoteAction } from "./shared-component-network/action";

export interface onSetupSharedComponent {
	onSetup(): void;
}

@Service({
	loadOrder: 0,
})
@Controller({
	loadOrder: 0,
})
export class SharedComponentHandler implements OnInit {
	constructor(private components: Components) {}

	/**
	 * @hidden
	 * @internal
	 */
	public onInit() {
		Modding.onListenerAdded<onSetupSharedComponent>((val) => val.onSetup());
		IsClient && this.onClientSetup();
		IsServer && this.onServerSetup();
	}

	private invokeDispatch(component: SharedComponent, actions: BroadcastAction[]) {
		component.__DispatchFromServer(actions);
	}

	private resolveComponent({ Instance, Identifier, SharedIdentifier, PointerID }: SharedComponentInfo) {
		if (!Modding.getObjectFromId(SharedIdentifier)) {
			logWarning(
				`Attempt to allow dispatching, but shared component does not exist\n SharedIdentifier: ${SharedIdentifier}`,
			);
			return;
		}

		// Try get component from pointer
		if (PointerID) {
			const pointer = Pointer.GetPointer(PointerID);

			if (!pointer) {
				logWarning(`Attempt to dispatch component with missing pointer\n PointerID: ${PointerID}`);
				return;
			}

			try {
				const component = this.components.getComponent<SharedComponent>(
					Instance,
					pointer.GetComponentMetadata(),
				);
				if (component) return component;
			} catch (error) {
				logWarning(`${error}\n PointerID: ${PointerID}`);
			}

			return;
		}

		// Try get component from indentifier
		if (Modding.getObjectFromId(Identifier)) {
			const component = this.components.getComponent<SharedComponent>(Instance, Identifier);
			if (component) return component;
		}

		// Try get component from shared identifier
		const sharedComponent = this.components.getComponents<SharedComponent>(Instance, SharedIdentifier);

		if (sharedComponent.size() > 1) {
			logWarning(
				`Attempt to allow dispatching when an instance has multiple sharedComponent\n Instance: ${Instance}\n SharedIdentifier: ${SharedIdentifier}\n ServerIdentifier: ${Identifier}`,
			);
			return;
		}

		return sharedComponent[0];
	}

	private onClientSetup() {
		remotes._shared_component_dispatch.connect((actions, componentInfo) => {
			const component = this.resolveComponent(componentInfo);
			component && this.invokeDispatch(component, actions);
		});

		remotes._shared_component_remote_event_Client.connect((componentInfo, eventName, args) => {
			const component = this.resolveComponent(componentInfo);
			if (!component) return;

			const remote = component.GetRemote(eventName);
			if (!IsSharedComponentRemoteEvent(remote)) return;
			if (!SharedRemoteEventServerToClient.Indefinitely(remote)) return;
			if (!remote.GetGuard()(args)) return;

			remote.GetSignal().Fire(...(args as []));
		});
	}

	private onServerSetup() {
		remotes._shared_component_remote_event_Server.connect((player, componentInfo, eventName, args) => {
			const component = this.resolveComponent(componentInfo);
			if (!component) return;

			const remote = component.GetRemote(eventName);
			if (!IsSharedComponentRemoteEvent(remote)) return;
			if (!SharedRemoteEventClientToServer.Indefinitely(remote)) return;
			if (!remote.GetGuard()(args)) return;

			remote.GetSignal().Fire(player, ...(args as []));
		});

		remotes._shared_component_remote_function_Server.onRequest((player, componentInfo, remoteName, args) => {
			const component = this.resolveComponent(componentInfo);
			if (!component) return;

			const remote = component.GetRemote(remoteName);
			if (!IsSharedComponentRemoteEvent(remote)) return;
			if (!SharedRemoteAction.Indefinitely(remote)) return;
			if (!remote.GetGuard()(args)) return ACTION_GUARD_FAILED;

			return remote.GetCallback()?.(...(args as []));
		});
	}
}

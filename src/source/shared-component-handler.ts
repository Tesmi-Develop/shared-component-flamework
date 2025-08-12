import { BaseComponent, Component, Components } from "@flamework/components";
import { AbstractConstructor } from "@flamework/components/out/utility";
import { Controller, Modding, OnInit, Reflect, Service } from "@flamework/core";
import { SyncPayload } from "@rbxts/charm-sync";
import { remotes } from "../remotes";
import { PlayerAction, SharedComponentInfo } from "../types";
import { GetConstructorIdentifier, GetParentConstructor, IsClient, IsServer, logWarning } from "../utilities";
import { ACTION_GUARD_FAILED, PLAYER_NOT_CONNECTED, SharedRemoteAction } from "./network/action";
import {
	IsSharedComponentRemoteEvent,
	SharedRemoteEventClientToServer,
	SharedRemoteEventServerToClient,
} from "./network/event";
import { Pointer } from "./pointer";
import { GetInstanceWithId, SharedComponent } from "./shared-component";

@Service({
	loadOrder: 0,
})
@Controller({
	loadOrder: 0,
})
export class SharedComponentHandler implements OnInit {
	private classParentCache = new Map<AbstractConstructor, readonly AbstractConstructor[]>();
	private polymorphicIds = new Map<AbstractConstructor, readonly string[]>();

	constructor(private components: Components) {}

	/** @hidden */
	public onInit() {
		const componentConfigs = Modding.getDecorators<typeof Component>();

		componentConfigs.forEach(({ constructor }) => {
			if (!constructor) return;
			this.polymorphicIds.set(constructor, this.getPolymorphicIds(constructor));
		});

		IsClient && this.onClientSetup();
		IsServer && this.onServerSetup();
	}

	private getOrderedParents(ctor: AbstractConstructor, omitBaseComponent = true) {
		const cache = this.classParentCache.get(ctor);
		if (cache) return cache;

		const classes = [ctor];
		let nextParent: AbstractConstructor | undefined = ctor;
		while ((nextParent = GetParentConstructor(nextParent)) !== undefined) {
			if (!omitBaseComponent || nextParent !== BaseComponent) {
				classes.push(nextParent);
			}
		}

		this.classParentCache.set(ctor, classes);
		return classes;
	}

	private getPolymorphicIds(component: AbstractConstructor) {
		const ids = new Array<string>();

		for (const parentClass of this.getOrderedParents(component)) {
			const parentId = Reflect.getOwnMetadata<string>(parentClass, "identifier");
			if (parentId === undefined) continue;

			ids.push(parentId);
		}

		const implementedList = Reflect.getMetadatas<string[]>(component, "flamework:implements");
		for (const implemented of implementedList) {
			for (const id of implemented) {
				ids.push(id);
			}
		}

		return ids;
	}

	private invokeDispatch(component: SharedComponent, payload: SyncPayload<{}>) {
		component.__DispatchFromServer(payload);
	}

	private printInfo(info: SharedComponentInfo) {
		const { InstanceId: ServerId, Identifier, SharedIdentifier, PointerID } = info;
		return `ServerId: ${ServerId}\n Identifier: ${Identifier}\n SharedIdentifier: ${SharedIdentifier}\n PointerID: ${PointerID}`;
	}

	private resolveComponent(info: SharedComponentInfo | string, callWarning = true) {
		if (typeIs(info, "string")) {
			const component = SharedComponent.instances.get(info);

			if (!component) {
				if (callWarning) logWarning(`Attempt to get component, but component does not exist\n ID: ${info}`);
				return;
			}

			return component;
		}

		const { InstanceId: ServerId, Identifier, SharedIdentifier, PointerID } = info;
		if (!Modding.getObjectFromId(SharedIdentifier)) {
			if (callWarning) logWarning(
				`Attempt to get component, but shared component does not exist\n Info: ${this.printInfo(info)}`,
			);
			return;
		}

		if (ServerId === "") {
			if (callWarning) logWarning(`Attempt to get component with missing serverID\n Info: ${this.printInfo(info)}`);
			return;
		}

		const instance = GetInstanceWithId(ServerId);
		if (!instance) {
			if (callWarning) logWarning(`Attempt to get component with missing serverID\n Info: ${this.printInfo(info)}`);
			return;
		}

		// Try get component from pointer
		if (PointerID) {
			const pointer = Pointer.GetPointer(PointerID);

			if (!pointer) {
				if (callWarning) logWarning(`Attempt to get component with missing pointer\n Info: ${this.printInfo(info)}`);
				return;
			}

			try {
				const component = this.components.getComponent<SharedComponent>(
					instance,
					pointer.GetComponentMetadata(),
				);
				if (component) return component;
			} catch (error) {
				if (callWarning) logWarning(`${error}\n PointerID: ${PointerID}`);
			}

			return;
		}

		// Try get component from indentifier
		if (Modding.getObjectFromId(Identifier)) {
			const component = this.components.getComponent<SharedComponent>(instance, Identifier);
			if (component) return component;
		}

		// Try get component from shared identifier
		const sharedComponent = this.components.getComponents<SharedComponent>(instance, SharedIdentifier);

		if (sharedComponent.size() > 1) {
			if (callWarning) logWarning(
				`Attempt to get component when an instance has multiple sharedComponent\n 
				Instance: ${instance}\n 
				FoundComponents: ${sharedComponent.map((s) => GetConstructorIdentifier(getmetatable(s) as never)).join(", ")}\n
				Info: ${this.printInfo(info)}`,
			);
			return;
		}

		return sharedComponent[0];
	}

	private onClientSetup() {
		remotes._shared_component_dispatch.connect(async (actions, componentInfo) => {
			const component = this.resolveComponent(componentInfo);
			if (component !== undefined) this.invokeDispatch(component, actions);
		});

		remotes._shared_component_remote_event_Client.connect(async (componentInfo, eventName, args) => {
			const component = this.resolveComponent(componentInfo);
			if (!component) return;

			const remote = component.__GetRemote(eventName);
			if (!IsSharedComponentRemoteEvent(remote)) return;
			if (!SharedRemoteEventServerToClient.Indefinitely(remote)) return;
			if (!remote.GetGuard()(args)) return;

			remote.GetSignal().Fire(...(args as []));
		});

		remotes._shared_component_disconnected.connect(async (componentInfo) => {
			const component = this.resolveComponent(componentInfo);
			if (!component) return;

			component.__Disconnected();
		});
	}

	private onServerSetup() {
		remotes._shared_component_remote_event_Server.connect(async (player, componentInfo, eventName, args) => {
			const component = this.resolveComponent(componentInfo);
			if (!component) return;
			if (!component.IsConnectedPlayer(player)) return;

			const remote = component.__GetRemote(eventName);
			if (!IsSharedComponentRemoteEvent(remote)) return;
			if (!SharedRemoteEventClientToServer.Indefinitely(remote)) return;
			if (!remote.GetGuard()(args)) return;

			remote.GetSignal().Fire(player, ...(args as []));
		});

		remotes._shared_component_remote_function_Server.onRequest(async (player, componentInfo, remoteName, args) => {
			const component = this.resolveComponent(componentInfo);
			if (!component) return;
			if (!component.IsConnectedPlayer(player)) return PLAYER_NOT_CONNECTED;

			const remote = component.__GetRemote(remoteName);
			if (!IsSharedComponentRemoteEvent(remote)) return;
			if (!SharedRemoteAction.Indefinitely(remote)) return;
			if (!remote.GetGuard()(args)) return ACTION_GUARD_FAILED;

			return remote.GetCallback()?.(player, ...(args as []));
		});

		remotes._shared_component_connection.onRequest(async (player, componentInfo, action) => {
			const component = this.resolveComponent(componentInfo, action === PlayerAction.Connect);
			if (!component) return [false, ""] as const;

			if (action === PlayerAction.Connect) {
				if (component.IsConnectedPlayer(player)) return [false, ""] as const;

				const success = component.__OnPlayerConnect(player);
				return success ? [true, component.GetID()] : ([false, ""] as const);
			}

			if (action === PlayerAction.Disconnect) {
				if (!component.IsConnectedPlayer(player)) return [false, ""] as const;
				component.__OnPlayerDisconnect(player);
				return [true, ""] as const;
			}

			return [false, ""] as const;
		});
	}
}

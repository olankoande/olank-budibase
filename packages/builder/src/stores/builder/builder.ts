import { derived, get } from "svelte/store"
import { createBuilderWebsocket } from "./websocket.js"
import { Socket } from "socket.io-client"
import { BuilderSocketEvent } from "@budibase/shared-core"
import { DerivedBudiStore } from "../BudiStore.js"
import { TOUR_KEYS } from "@/components/portal/onboarding/tours.js"
import { App } from "@budibase/types"
import { datasourceSelect as format } from "@/helpers/data/format"
import { tables } from "./tables.js"
import { datasources } from "./datasources.js"
import { viewsV2 } from "./viewsV2.js"

interface BuilderState {
  previousTopNavPath: Record<string, string>
  highlightedSetting: {
    key: string
    type: "info" | string
  } | null
  propertyFocus: string | null
  builderSidePanel: boolean
  onboarding: boolean
  tourNodes: Record<string, HTMLElement> | null
  tourKey: string | null
  tourStepKey: string | null
  hoveredComponentId: string | null
  websocket?: Socket
}

export const INITIAL_BUILDER_STATE: BuilderState = {
  previousTopNavPath: {},
  highlightedSetting: null,
  propertyFocus: null,
  builderSidePanel: false,
  onboarding: false,
  tourNodes: null,
  tourKey: null,
  tourStepKey: null,
  hoveredComponentId: null,
}

interface DerivedBuilderState {
  formatedDatasourceNames: {
    tables: {
      label: string
      resourceId: string
      datasourceName: string
    }[]
    viewsV2: {
      label: string
      resourceId: string
      datasourceName: string
    }[]
  }
}

export class BuilderStore extends DerivedBudiStore<
  BuilderState,
  DerivedBuilderState
> {
  websocket?: Socket

  constructor() {
    const makeDerivedStore = () => {
      return derived(
        [tables, datasources, viewsV2],
        ([$tables, $datasources, $viewsV2]) => ({
          formatedDatasourceNames: {
            tables: $tables.list
              .map(table => {
                const formatted = format.table(table, $datasources.list)
                return {
                  label: formatted.label,
                  datasourceName: formatted.datasourceName,
                  resourceId: table._id!,
                }
              })
              .sort((a, b) => {
                // sort tables alphabetically, grouped by datasource
                const dsA = a.datasourceName ?? ""
                const dsB = b.datasourceName ?? ""

                const dsComparison = dsA.localeCompare(dsB)
                if (dsComparison !== 0) {
                  return dsComparison
                }
                return a.label.localeCompare(b.label)
              }),
            viewsV2: $viewsV2.list.map(view => {
              const formatted = format.viewV2(view, $datasources.list)
              return {
                label: formatted.label,
                datasourceName: formatted.datasourceName,
                resourceId: view.id,
              }
            }),
          },
        })
      )
    }

    super({ ...INITIAL_BUILDER_STATE }, makeDerivedStore)

    this.init = this.init.bind(this)
    this.refresh = this.refresh.bind(this)
    this.reset = this.reset.bind(this)
    this.highlightSetting = this.highlightSetting.bind(this)
    this.propertyFocus = this.propertyFocus.bind(this)
    this.hideBuilderSidePanel = this.hideBuilderSidePanel.bind(this)
    this.showBuilderSidePanel = this.showBuilderSidePanel.bind(this)
    this.setPreviousTopNavPath = this.setPreviousTopNavPath.bind(this)
    this.selectResource = this.selectResource.bind(this)
    this.registerTourNode = this.registerTourNode.bind(this)
    this.destroyTourNode = this.destroyTourNode.bind(this)
    this.startBuilderOnboarding = this.startBuilderOnboarding.bind(this)
  }

  init(app: App) {
    if (!app?.appId) {
      console.error("BuilderStore: No appId supplied for websocket")
      return
    }
    if (!this.websocket) {
      this.websocket = createBuilderWebsocket(app.appId)
    }
  }

  refresh() {
    const currentState = get(this.store)
    this.store.set(currentState)
  }

  reset() {
    this.store.set({ ...INITIAL_BUILDER_STATE })
    this.websocket?.disconnect()
    this.websocket = undefined
  }

  highlightSetting(key?: string, type?: string) {
    this.update(state => ({
      ...state,
      highlightedSetting: key ? { key, type: type || "info" } : null,
    }))
  }

  propertyFocus(key: string | null) {
    this.update(state => ({
      ...state,
      propertyFocus: key,
    }))
  }

  showBuilderSidePanel() {
    this.update(state => ({
      ...state,
      builderSidePanel: true,
    }))
  }

  hideBuilderSidePanel() {
    this.update(state => ({
      ...state,
      builderSidePanel: false,
    }))
  }

  setPreviousTopNavPath(route: string, url: string) {
    this.update(state => ({
      ...state,
      previousTopNavPath: {
        ...(state.previousTopNavPath || {}),
        [route]: url,
      },
    }))
  }

  selectResource(id: string) {
    this.websocket?.emit(BuilderSocketEvent.SelectResource, {
      resourceId: id,
    })
  }

  registerTourNode(tourStepKey: string, node: HTMLElement) {
    this.update(state => {
      const update = {
        ...state,
        tourNodes: {
          ...state.tourNodes,
          [tourStepKey]: node,
        },
      }
      return update
    })
  }

  destroyTourNode(tourStepKey: string) {
    const store = get(this.store)
    if (store.tourNodes?.[tourStepKey]) {
      const nodes = { ...store.tourNodes }
      delete nodes[tourStepKey]
      this.update(state => ({
        ...state,
        tourNodes: nodes,
      }))
    }
  }

  startBuilderOnboarding() {
    this.update(state => ({
      ...state,
      onboarding: true,
      tourKey: TOUR_KEYS.TOUR_BUILDER_ONBOARDING,
    }))
  }

  endBuilderOnboarding() {
    this.update(state => ({
      ...state,
      onboarding: false,
    }))
  }

  setTour(tourKey?: string | null) {
    this.update(state => ({
      ...state,
      tourStepKey: null,
      tourNodes: null,
      tourKey: tourKey || null,
    }))
  }
}

export const builderStore = new BuilderStore()

import { ViewV2, ViewV2Enriched } from "@budibase/types"
import { context, HTTPError } from "@budibase/backend-core"

import sdk from "../../../sdk"
import * as utils from "../../../db/utils"
import { enrichSchema, isV2 } from "."
import { breakExternalTableId } from "../../../integrations/utils"
import { ensureQuerySet, ensureQueryUISet } from "./utils"

export async function get(viewId: string): Promise<ViewV2> {
  const { tableId } = utils.extractViewInfoFromID(viewId)

  const { datasourceId, tableName } = breakExternalTableId(tableId)
  const ds = await sdk.datasources.get(datasourceId)

  const table = ds.entities![tableName]
  const views = Object.values(table.views!).filter(isV2)
  const found = views.find(v => v.id === viewId)
  if (!found) {
    throw new Error("No view found")
  }
  return ensureQueryUISet(found)
}

export async function getEnriched(
  viewId: string
): Promise<ViewV2Enriched | undefined> {
  const { tableId } = utils.extractViewInfoFromID(viewId)

  const { datasourceId, tableName } = breakExternalTableId(tableId)
  const ds = await sdk.datasources.get(datasourceId)

  const table = ds.entities![tableName]
  const views = Object.values(table.views!).filter(isV2)
  const found = views.find(v => v.id === viewId)
  if (!found) {
    return
  }
  return await enrichSchema(ensureQueryUISet(found), table.schema)
}

export async function create(
  tableId: string,
  viewRequest: Omit<ViewV2, "id" | "version">
): Promise<ViewV2> {
  let view: ViewV2 = {
    ...viewRequest,
    id: utils.generateViewID(tableId),
    version: 2,
  }

  view = ensureQuerySet(view)
  view = ensureQueryUISet(view)

  const db = context.getAppDB()

  const { datasourceId, tableName } = breakExternalTableId(tableId)
  const ds = await sdk.datasources.get(datasourceId)
  ds.entities![tableName].views ??= {}
  ds.entities![tableName].views![view.name] = view
  await db.put(ds)
  return view
}

export async function update(
  tableId: string,
  view: Readonly<ViewV2>
): Promise<{ view: Readonly<ViewV2>; existingView: ViewV2 }> {
  const db = context.getAppDB()

  const { datasourceId, tableName } = breakExternalTableId(tableId)
  const ds = await sdk.datasources.get(datasourceId)
  ds.entities![tableName].views ??= {}
  const views = ds.entities![tableName].views!

  const existingView = Object.values(views).find(
    v => isV2(v) && v.id === view.id
  )
  if (!existingView || !existingView.name) {
    throw new HTTPError(`View ${view.id} not found in table ${tableId}`, 404)
  }
  if (isV2(existingView) && existingView.type !== view.type) {
    throw new HTTPError(`Cannot update view type after creation`, 400)
  }

  view = ensureQuerySet(view)
  view = ensureQueryUISet(view)

  delete views[existingView.name]
  views[view.name] = view
  await db.put(ds)
  return { view, existingView } as { view: ViewV2; existingView: ViewV2 }
}

export async function remove(viewId: string): Promise<ViewV2> {
  const db = context.getAppDB()

  const view = await get(viewId)

  if (!view) {
    throw new HTTPError(`View ${viewId} not found`, 404)
  }

  const { datasourceId, tableName } = breakExternalTableId(view.tableId)
  const ds = await sdk.datasources.get(datasourceId)

  delete ds.entities![tableName].views![view?.name]
  await db.put(ds)
  return view
}

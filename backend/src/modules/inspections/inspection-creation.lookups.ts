import type { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../types/auth';
import { prisma } from '../../database/prisma';
import { ApiError } from '../../utils/ApiError';

/** Match assertVehicleInScope: these choices do not grant inspection write access. */
export function inspectionCreationVehicleScope(actor: AuthenticatedUser): Prisma.VehicleWhereInput {
  if (['SUPER_ADMIN','JSAN_ADMIN'].includes(actor.role.name)) return {};
  if (actor.organizationType==='VEHICLE_VENDOR'||actor.organizationType==='TRANSPORT_PARTNER')
    return {inventory:{currentCustodianType:'VENDOR',currentCustodianId:actor.organizationId??'__none__'}};
  if (actor.role.name==='OPERATIONS_MANAGER') return {inventory:{currentDepotId:{in:actor.depotIds}}};
  return {OR:[{organizationId:actor.organizationId??'__none__'},{inventory:{receivedFromOrgId:actor.organizationId??'__none__'}}]};
}

export async function inspectionCreationChoices(actor: AuthenticatedUser) {
  const manage=actor.permissions.includes('inspections:manage');
  if(!manage&&!actor.permissions.includes('inspections:confirm'))throw ApiError.forbidden();
  const vehicles=await prisma.vehicle.findMany({where:inspectionCreationVehicleScope(actor),select:{id:true,vehicleCode:true,registrationNumber:true},orderBy:[{vehicleCode:'asc'},{id:'asc'}]});
  const items=vehicles.length ? await prisma.dispatchVehicle.findMany({
    where:{vehicleId:{in:vehicles.map(v=>v.id)},dispatch:{state:{in:['PLANNED','READY','CONFIRMED']}}},
    select:{vehicleId:true,dispatch:{select:{id:true,reference:true,destinationDepotId:true}}},
  }):[];
  const dispatches=new Map<string,{id:string;reference:string;destinationDepotId:string;vehicleIds:string[]}>();
  for(const item of items){const entry=dispatches.get(item.dispatch.id)??{...item.dispatch,vehicleIds:[]};entry.vehicleIds.push(item.vehicleId);dispatches.set(entry.id,entry);}
  return {vehicles,dispatches:[...dispatches.values()],allowedTypes:manage?['INITIAL_RECEIPT','PRE_DISPATCH','RECEIVING','RETURN']:['RECEIVING']};
}

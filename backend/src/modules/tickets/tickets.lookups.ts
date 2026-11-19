import { prisma } from '../../database/prisma';
import type { AuthenticatedUser } from '../../types/auth';
import { ApiError } from '../../utils/ApiError';
import { isInternalTicketActor } from './tickets.workflow';

/** Minimal form choices for ticket creators; does not grant Master Data access.
 * Destinations and models are shared reference choices, not vehicle/custody records.
 * Actual vehicle selection and writes retain their existing server-side scope checks.
 */
export async function ticketCreationLookups(actor: AuthenticatedUser) {
  if (!actor.permissions.includes('tickets:create')) throw ApiError.forbidden('You cannot create tickets');
  const [models, depots, requestingOrganizations] = await Promise.all([
    prisma.vehicleModel.findMany({
      where: { isActive: true, make: { isActive: true } },
      select: { id: true, name: true, variant: true, make: { select: { id: true, name: true } } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    }),
    prisma.depot.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
    isInternalTicketActor(actor)
      ? prisma.organization.findMany({where:{status:'ACTIVE',type:{in:['VEHICLE_VENDOR','TRANSPORT_PARTNER']}},select:{id:true,name:true},orderBy:[{name:'asc'},{id:'asc'}]})
      : Promise.resolve([]),
  ]);
  return { models, depots, requestingOrganizations };
}

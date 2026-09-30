import { z } from 'zod';
import { orderSchema, orderSizeSchema } from '../entities/order.ts';
import { orderStatusSchema, temperatureRequirementSchema } from '../enums.ts';
import { isoDateSchema, outletIdSchema } from '../primitives.ts';
import { listResponseSchema } from './common.ts';

// Outlet and brand come from the signed-in Store Manager's outlet, never from the request.
export const createOrderRequestSchema = z.object({
  requestedDate: isoDateSchema,
  temp: temperatureRequirementSchema,
  ...orderSizeSchema.shape,
});
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;

export const updateOrderRequestSchema = createOrderRequestSchema
  .partial()
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'At least one field must change',
  });
export type UpdateOrderRequest = z.infer<typeof updateOrderRequestSchema>;

export const listOrdersQuerySchema = z.object({
  status: orderStatusSchema.optional(),
  requestedDate: isoDateSchema.optional(),
  outletId: outletIdSchema.optional(),
});
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

export const orderListResponseSchema = listResponseSchema(orderSchema);
export type OrderListResponse = z.infer<typeof orderListResponseSchema>;

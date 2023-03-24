import { z } from "zod";
import { publicProcedure, router } from "../trpc";

export const category = router({
    getCategoryCount: publicProcedure.query(async ({ctx}) =>{
        return await ctx.prisma.category.count();
    }),

    addCategory: publicProcedure
        .input(
            z.object({
                name: z.string(),
                numOfQuestions: z.number(),
                poolId: z.string()
            })
        )
        .mutation(async ({ctx, input})=>{
            const data= await ctx.prisma.category.create({
                data:{
                    name: input.name,
                    numOfQuestions: input.numOfQuestions,
                    poolId: input.poolId
                }
            });

            return data;
        }),

    getCategory: publicProcedure
        .input(
            z.object({
                id:z.string()
            })
        )
        .query(async ({ctx, input})=>{
            const data = await ctx.prisma.category.findUnique({
                where:{
                    id: input.id
                }
            });
            return data;
        }),
    
    getAllCategories: publicProcedure
        .input(
            z.object({
                skip:z.number(),
                search: z.string().optional()
            })
        )
        .query(async ({ctx, input})=>{
            const data = await ctx.prisma.category.findMany({
                skip: input.skip,
                take:6,
                where:{
                    name:{
                        contains: input.search
                    },
                },
            });
            return data;
        }),

    updateCategory: publicProcedure
        .input(
            z.object({
                name: z.string(),
                id:z.string()
            })
        )
        .mutation(async ({ctx, input})=>{
            const data = await ctx.prisma.category.update({
                where:{
                    id: input.id,
                },
                data:{
                    name: input.name
                }
            });
            return data;
        }),
        
    deleteCategory: publicProcedure
        .input(
            z.object({
                id: z.string()
            })
        )
        .mutation(async ({ctx,input})=>{
            const data = await ctx.prisma.category.delete({
                where:{
                    id:input.id
                }
            });
            return data; //MIGHT NEED ADDITIONAL CHECKS
        })
    
});

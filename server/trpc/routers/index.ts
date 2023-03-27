import { z } from 'zod'
import { publicProcedure, router } from '../trpc'

import { examGroupRouter } from './examGroups';
import { contributorRouter } from './contributor'
import { poolRouter } from './pool';
import {questionRouter} from './question'
import {testTakerRouter} from './testtaker'

export const appRouter = router({

    pool: poolRouter,
    examGroup: examGroupRouter,
    contributor: contributorRouter,
    question :questionRouter,
    testtaker : testTakerRouter,
    
});

// export type definition of API
export type AppRouter = typeof appRouter
